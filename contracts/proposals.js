const fs = require('fs')
const dir = require('path')
const axios = require('axios');
const splitFile = require('split-file');
const yaml = require('js-yaml')
const { mean, get } = require('lodash');
const { MAIN_PATH, GIT_TOKEN } = require('../config')
const { convertStringDollarToNumeric } = require('../utils/helpers')
const homedir = MAIN_PATH || require('os').homedir()
const { getProposalContract, getVoterContract } = require('../utils/contract')
const { getUser } = require('./users')
const { getProposalTemplate: getProposalTemplateFromGithub } = require('../utils/github')
const { convertStringToHash } = require('../utils/web3')
const proposalsDirName = dir.join(homedir, '/proposals')
if (!fs.existsSync(proposalsDirName)) {
  fs.mkdirSync(proposalsDirName);
}
const fetchProposalYaml = async (proposalContract, yamlBlockHash, index, allOutputs = [], initialHash, finalIndex) => {

  const yamlBlock = await proposalContract.callSmartContractGetFunc('getProposalYaml', [yamlBlockHash], 900000)
  const initHash = initialHash || yamlBlockHash
  const outpuFileName = `${proposalsDirName}/${initHash}-${index}`;
  // fs.writeFileSync(`${proposalsDirName}/output-${index}`, JSON.stringify(configs), 'utf-8');
  fs.writeFileSync(outpuFileName, yamlBlock.content, 'utf-8');
  allOutputs.push(outpuFileName)
  if (!yamlBlock.lastBlock && !finalIndex) {
    await fetchProposalYaml(proposalContract, yamlBlock.nextBlock, index + 1, allOutputs, initHash)
  }
  return allOutputs
}

/*
* List proposal ids only
*/
const listProposalIds = async (contract = null) => {
  if (!contract) {
    contract = getProposalContract()
  }
  let cursor = 0;
  let howMany = 1000; // Get thousands at a time
  let allIds = []
  try {
    do {
      let proposalIds = await contract.callSmartContractGetFunc('getproposalIdsByCursor', [cursor, howMany])
      allIds = allIds.concat(proposalIds)
      cursor = cursor + howMany
    } while (1)
  }
  catch (e) {
    console.log(e.message)
  }
  return allIds
}

/*
* Return proposal details based on proposal IDs
*/
const getProposalDetails = async (proposalId, proposalContract = null, voterContract = null) => {
  if (!proposalContract) {
    proposalContract = getProposalContract()
  }
  if (!voterContract) {
    voterContract = getVoterContract()
  }
  const proposal = await proposalContract.callSmartContractGetFunc('getProposal', [parseInt(proposalId)])
  const filePath = `${proposalsDirName}/main-${proposal.yamlBlock}.yaml`

  if (!fs.existsSync(filePath) && Object.keys(proposal).length > 0) {
    outputFiles = await fetchProposalYaml(proposalContract, proposal.yamlBlock, 1)
    await splitFile.mergeFiles(outputFiles, filePath)
  }

  const voterRes = await voterContract.callSmartContractGetFunc('getProposalVotesInfo', [parseInt(proposalId)])
  let file
  try {
    file = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  } catch (e) {
    console.log(e)
  }
  let summary = ''
  let amount = 0
  if (file === undefined) {
    console.log('ProposalID', proposalId)
  } else {
    summary = file.summary || file.Summary
    amount = convertStringDollarToNumeric(summary)
  }
  if (amount === 0 || isNaN(amount)) {
    amount = 0
  }
  //get ratings of proposal
  const feedbacks = await proposalFeedback(proposalId, proposalContract)
  const ratings = get(feedbacks, 'ratingData', 0)
  const complaints = get(feedbacks, 'complaintData', 0)
  return {
    id: proposalId,
    name: proposal.name,
    theftAmt: amount || proposal.theftAmt,
    year: proposal.year,
    votes: voterRes.totalVotes,
    detail: file || {},
    proposal_hash: proposal.yamlBlock,
    date: new Date(proposal.date * 1000),
    summary_year: file ? file.summary_year || file.Summary_Year : proposal.year,
    summary: summary || proposal.name || '$0',
    link: '',
    title: file && (file.title || file.Title) ? file.title || file.Title : 'No Title available',
    description: file && file.describe_problem_area ? file.describe_problem_area : 'No Description available',
    amount: amount,
    ratings,
    complaints
  }
}

const getProposals = async (proposalIDs, proposalContract = null) => {
  if (!proposalContract) {
    proposalContract = getProposalContract()
    proposalContract.init()
  }
  const promises = proposalIDs.map(async (proposalID) => {
    const proposalDetail = await proposalContract.callSmartContractGetFunc('getProposal', [parseInt(proposalID)])
    const votesContract = getVoterContract()
    votesContract.init()
    const votingDetail = await votesContract.callSmartContractGetFunc('getProposalVotesInfo', [parseInt(proposalID)])
    const mainProposal = {
      "id": proposalID,
      "owner": proposalDetail[0],
      "summary": proposalDetail[1],
      "votes": votingDetail[0].length,
      "proposal_hash": proposalDetail[3],
      "created_at": proposalDetail[4]
    }

    return mainProposal
  })
  const proposals = await Promise.all(promises)
  return proposals
}

/*
* Return all proposals
*/
const allProposals = async () => {
  const proposalContract = getProposalContract()
  proposalContract.init()
  const proposalIDs = await proposalContract.callSmartContractGetFunc('getproposalIds', [])
  return getProposals(proposalIDs, proposalContract)
}

/*
* Watch Proposal and return
*/
const proposalsFromEvents = async (methodName, args = {}) => {
  const proposalContract = getProposalContract()
  return await proposalContract.watchEvent('LogProposalCreation', methodName, args)
}

/*
* Vote to a particular proposal using holon
*/
const voteByHolon = async body => {
  const contract = getProposalContract()
  return contract.createTransaction('holonVote', [true, parseInt(body.proposalId), (body.amount || '').toString(), body.comment || '', body.voter, body.signedMessage, 0, body.year, body.priorVoteId], undefined, undefined, 'proxy')
}

/*
* Fetch proposal template based on path and return yaml content
*/
const getProposalTemplate = path => {
  return getProposalTemplateFromGithub(path)
}
/* get rating of proposal */
const proposalRating = async (proposalContract, proposalID) => {
  try {
    const feedbackers = await proposalContract.callSmartContractGetFunc('totalRaters', [proposalID])

    let ratingPromises = feedbackers.map(async (feedbacker) => {
      const feedback = await proposalContract.callSmartContractGetFunc('getRating', [proposalID, feedbacker])
      return parseInt(feedback.rating)
    })
    const allRatings = await Promise.all(ratingPromises)
    return { success: true, count: feedbackers.length, rating: mean(allRatings) || 0 }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/* get complaints of proposal */
const proposalComplaints = async (proposalContract, proposalID) => {
  try {
    let complaints = {}
    const complainers = await proposalContract.callSmartContractGetFunc('totalComplainers', [proposalID])
    let complaintPromises = complainers.map(async (complainer) => {
      const countComplaints = await proposalContract.callSmartContractGetFunc('countUserComplaints', [proposalID, complainer]);
      const userInfo = await getUser(complainer);
      for (let i = 1; i <= parseInt(countComplaints); i++) {
        let complaintInfo = await proposalContract.callSmartContractGetFunc('getUserComplaint', [proposalID, complainer, i]);
        complaints[complaintInfo.date] = { complainer: userInfo.name, comment: complaintInfo.comment, date: complaintInfo.date }
      }
    })
    await Promise.all(complaintPromises)

    return { success: true, count: Object.keys(complaints).length, allComplaints: complaints }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

const proposalFeedback = async (proposalID, proposalContract = null) => {
  if (!proposalContract) {
    proposalContract = getProposalContract()
    proposalContract.init()
  }
  const ratingData = await proposalRating(proposalContract, proposalID);
  const complaintData = await proposalComplaints(proposalContract, proposalID);
  if (!ratingData.success || !complaintData.success) {
    return { success: false, error: ratingData.error || complaintData.error };
  }
  return { success: true, ratingData, complaintData };
}

const userFeedback = async (proposalID, userAddress, proposalContract = null) => {
  try {
    if (!proposalContract) {
      proposalContract = getProposalContract()
      proposalContract.init()
    }
    const complaints = {}
    const feedback = await proposalContract.callSmartContractGetFunc('getRating', [proposalID, userAddress])
    const countComplaints = await proposalContract.callSmartContractGetFunc('countUserComplaints', [proposalID, userAddress]);
    const userInfo = await getUser(userAddress);
    for (let i = 1; i <= parseInt(countComplaints); i++) {
      let complaintInfo = await proposalContract.callSmartContractGetFunc('getUserComplaint', [proposalID, userAddress, i]);
      complaints[complaintInfo.date] = { complainer: userInfo.name, comment: complaintInfo.comment, date: complaintInfo.date }
    }
    return { success: true, ratingData: { rating: parseInt(feedback.rating), createdAt: feedback.createdAt, updatedAt: feedback.updatedAt }, complaintData: complaints };
  } catch (e) {
    return { success: false, error: e.message }
  }
}

const getPathProposalsByYear = async (path, year, contract, voterContract) => {
  const pathHash = convertStringToHash(path)
  const proposalC = contract || getProposalContract()
  const voterC = voterContract || getVoterContract()
  await voterC.init()
  const { data: cachedProposalsByPaths, file } = getCachedProposalsByPathsDir(pathHash)

  const proposalIds = await proposalC.callSmartContractGetFunc('proposalsPerPathYear', [pathHash, year])
  return Promise.all(proposalIds.map(async id => {
    try {
      let proposal = await getOrSaveCachedProposal(id, cachedProposalsByPaths, proposalC, file)
      const voterRes = await voterC.callSmartContractGetFunc('getProposalVotesInfo', [parseInt(id)])
      const feedbacks = await proposalFeedback(id, proposalC)

      const ratings = get(feedbacks, 'ratingData', 0)
      const complaints = get(feedbacks, 'complaintData', 0)
      return {
        ...proposal,
        votes: voterRes.totalVotes.length,
        ratings,
        complaints
      }
    } catch (e) {
      console.log('exception occured', id)
      return null;
    }
  }))
}

const getOrSaveCachedProposal = async (proposalId, cachedProposalsByPaths, proposalC, cacheFile) => {
  let proposal = cachedProposalsByPaths[proposalId]
  if (proposal) return proposal

  proposal = await proposalC.callSmartContractGetFunc('getProposal', [parseInt(proposalId)])
  const filePath = `${proposalsDirName}/main-${proposal.yamlBlock}.yaml`

  if (!fs.existsSync(filePath) && Object.keys(proposal).length > 0) {
    outputFiles = await fetchProposalYaml(proposalC, proposal.yamlBlock, 1)
    await splitFile.mergeFiles(outputFiles, filePath)
  }

  let file, error, summary = '', amount = 0
  try {
    file = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  } catch (e) {
    error = true
  }

  if (file) {
    summary = file.summary || file.Summary
    amount = convertStringDollarToNumeric(summary)
  }
  amount = isNaN(amount) ? 0 : amount

  let newProposal = {
    id: proposalId,
    name: proposal.name,
    theftAmt: amount || proposal.theftAmt,
    year: proposal.year,
    date: new Date(proposal.date * 1000),
    summary_year: file ? file.summary_year || file.Summary_Year : proposal.year,
    summary: summary || proposal.name || '$0',
    author: file.author,
    title: file && (file.title || file.Title) ? file.title || file.Title : 'No Title available',
    description: file && file.describe_problem_area ? file.describe_problem_area : 'No Description available',
    amount: amount
  }

  if (!error) {
    const data = JSON.stringify({ ...cachedProposalsByPaths, [proposalId]: newProposal })
    fs.writeFileSync(cacheFile, data)
  }

  return newProposal
}

const getCachedProposalsByPathsDir = path => {
  const cachedProposalsByPathsDir = dir.join(proposalsDirName, 'proposals-by-paths')
  const cachedProposalsByPaths = dir.join(cachedProposalsByPathsDir, path)

  try {
    if (!fs.existsSync(cachedProposalsByPathsDir)) {
      fs.mkdirSync(cachedProposalsByPathsDir);
    }

    let rawdata = fs.readFileSync(cachedProposalsByPaths)
    return { data: JSON.parse(rawdata), file: cachedProposalsByPaths }
  } catch (e) {
    return { data: {}, file: cachedProposalsByPaths }
  }
}


module.exports = {
  getProposals,
  allProposals,
  listProposalIds,
  proposalsFromEvents,
  voteByHolon,
  fetchProposalYaml,
  proposalsDirName,
  getProposalTemplate,
  proposalRating,
  proposalFeedback,
  userFeedback,
  getProposalDetails,
  getPathProposalsByYear
}
