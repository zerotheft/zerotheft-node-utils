const fs = require('fs')
const dir = require('path')
const PromisePool = require('@supercharge/promise-pool')
const splitFile = require('split-file');
const yaml = require('js-yaml')
const { mean, get, isEmpty } = require('lodash');
const { getUser } = require('./users')
const { APP_PATH } = require('../config')
const { convertStringToHash } = require('../utils/web3')
const { convertStringDollarToNumeric } = require('../utils/helpers')
const { getProposalContract, getVoterContract } = require('../utils/contract')
const { getGithubTemplate } = require('../utils/github')

const homedir = APP_PATH || require('os').homedir()
const nationExportsDir = `${APP_PATH}/public/exports/nation_data`
const tmpPropDir = dir.join(homedir, '/tmp')
if (!fs.existsSync(tmpPropDir)) {
  fs.mkdirSync(tmpPropDir, { recursive: true });
}
/**
 * Scan blockchain and return array of proposal blocks
 * @param {Object} proposalContract 
 * @param {string} yamlBlockHash 
 * @param {integer} index 
 * @param {Array} allOutputs 
 * @param {String} initialHash 
 * @param {integer} finalIndex 
 * @returns Array of all chunks
 */
const fetchProposalYaml = async (proposalContract, yamlBlockHash, index, allOutputs = [], initialHash, finalIndex) => {

  const yamlBlock = await proposalContract.callSmartContractGetFunc('getProposalYaml', [yamlBlockHash], 900000)
  const initHash = initialHash || yamlBlockHash
  const outpuFileName = `${tmpPropDir}/${initHash}-${index}`;
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
  const filePath = `${tmpPropDir}/main-${proposal.yamlBlock}.yaml`

  if (!fs.existsSync(filePath) && Object.keys(proposal).length > 0) {
    let outputFiles = await fetchProposalYaml(proposalContract, proposal.yamlBlock, 1)
    await splitFile.mergeFiles(outputFiles, filePath)
    // outputFiles.map(f => fs.existsSync(f) && fs.unlinkSync(f))
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
  // if (fs.existsSync(filePath))
  //   fs.unlinkSync(filePath)

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
  return getGithubTemplate(path)
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
    const complainers = await proposalContract.callSmartContractGetFunc('totalCommentors', [proposalID])
    let complaintPromises = complainers.map(async (complainer) => {
      const countComplaints = await proposalContract.callSmartContractGetFunc('countUserComments', [proposalID, complainer]);
      const userInfo = await getUser(complainer);
      for (let i = 1; i <= parseInt(countComplaints); i++) {
        let complaintInfo = await proposalContract.callSmartContractGetFunc('getUserComment', [proposalID, complainer, i]);
        complaints[complaintInfo.date] = { complainer: userInfo.name, comment: complaintInfo.description, date: complaintInfo.date }
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
    const countComplaints = await proposalContract.callSmartContractGetFunc('countUserComments', [proposalID, userAddress]);
    const userInfo = await getUser(userAddress);
    for (let i = 1; i <= parseInt(countComplaints); i++) {
      let complaintInfo = await proposalContract.callSmartContractGetFunc('getUserComment', [proposalID, userAddress, i]);
      complaints[complaintInfo.date] = { complainer: userInfo.name, comment: complaintInfo.description, date: complaintInfo.date }
    }
    return { success: true, ratingData: { rating: parseInt(feedback.rating), createdAt: feedback.createdAt, updatedAt: feedback.updatedAt }, complaintData: complaints };
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Returns proposal details by path and year
 * @param {string} path 
 * @param {integer} year 
 * @param {Object} contract 
 * @param {Object} voterContract 
 * @returns proposal JSONs
 */
const getPathProposalsByYear = async (path, year, contract, voterContract) => {
  const pathHash = convertStringToHash(path)
  const proposalC = contract || getProposalContract()
  const voterC = voterContract || getVoterContract()

  const { data: cachedProposalsByPaths, file } = getCachedProposalsByPathsDir(pathHash)
  //get cachedproposal
  let cachedFiles = [], newProposals = {}
  const cachedProposalDir = `${nationExportsDir}/${path}/${year}/proposals`
  if (fs.existsSync(cachedProposalDir)) {
    cachedFiles = fs.readdirSync(cachedProposalDir);
  }

  const proposalIds = await proposalC.callSmartContractGetFunc('proposalsPerPathYear', [pathHash, year])
  let { results, errors } = await PromisePool
    .withConcurrency(1)
    .for(proposalIds)
    .process(async pid => {
      try {
        let pData = await getProposalData(pid, cachedProposalsByPaths, proposalC, cachedFiles, path, year)
        const voterRes = await voterC.callSmartContractGetFunc('getProposalVotesInfo', [parseInt(pid)])
        const feedbacks = await proposalFeedback(pid, proposalC)

        const ratings = get(feedbacks, 'ratingData', 0)
        const complaints = get(feedbacks, 'complaintData', 0)
        if (!pData.fromCache) {
          newProposals[pid] = pData.proposal
        }
        return {
          ...pData.proposal,
          votes: voterRes.totalVotes.length,
          ratings,
          complaints
        }
      } catch (e) {
        console.log(e)
        console.log('exception occured', pid)
        return null;
      }
    })
  // append new proposals in cache file
  if (!isEmpty(newProposals))
    fs.writeFileSync(file, JSON.stringify({ ...cachedProposalsByPaths, ...newProposals }))

  return results
}

/**
 * Returns proposal data either from cache or from blockchain
 * @param {integer} proposalId 
 * @param {Object} cachedProposalsByPaths 
 * @param {Object} proposalC 
 * @param {String} cacheFile 
 * @returns Proposal's object
 */
const getProposalData = async (proposalId, cachedProposalsByPaths, proposalC, cachedYamls, path, year) => {
  let file, summary = '', amount = 0, filePath

  let proposal = cachedProposalsByPaths[proposalId]
  if (proposal) return { proposal, fromCache: true }
  proposal = await proposalC.callSmartContractGetFunc('getProposal', [parseInt(proposalId)])
  //check if proposal Yaml is in cache
  if (cachedYamls.length > 0) {
    let regex = new RegExp("^" + proposalId + "_proposal");
    let cacheYaml = cachedYamls.filter(value => regex.test(value))
    if (cacheYaml.length > 0) {
      filePath = `${nationExportsDir}/${path}/${year}/proposals/${cacheYaml[0]}`
    }
  }

  if (!filePath) { // if not found in cache then search blockchain
    filePath = `${tmpPropDir}/main-${proposal.yamlBlock}.yaml`
    if (!fs.existsSync(filePath) && Object.keys(proposal).length > 0) {
      let outputFiles = await fetchProposalYaml(proposalC, proposal.yamlBlock, 1)
      await splitFile.mergeFiles(outputFiles, filePath)
      outputFiles.map(f => fs.existsSync(f) && fs.unlinkSync(f))
    }
  }

  try {
    file = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  } catch (e) {
    console.log('getProposalData:', e.message)
  }

  if (file) {
    summary = file.summary || file.Summary
    amount = convertStringDollarToNumeric(summary)
  }
  amount = isNaN(amount) ? 0 : amount
  if (fs.existsSync(filePath))
    fs.unlinkSync(filePath)
  return {
    proposal: {
      id: proposalId,
      name: proposal.name,
      theftAmt: proposal.theftAmt,
      year: proposal.year,
      date: new Date(proposal.date * 1000),
      summary_year: file ? file.summary_year || file.Summary_Year : proposal.year,
      summary: summary || proposal.name || '$0',
      author: file && file.author,
      title: file && (file.title || file.Title) ? file.title || file.Title : 'No Title available',
      description: file && file.describe_problem_area ? file.describe_problem_area : 'No Description available',
      amount
    }, fromCache: false
  }
}

/**
 * Returns proposal yaml either from cache or from blockchain
 * @param {integer} proposalId 
 * @param {String} pathHash 
 * @param {String} path 
 * @param {String} year 
 * @param {Object} contract 
 * @returns Proposal's YAML object
 */
const getProposalYaml = async (proposalId, pathHash, path, year, contract) => {
  let yamlJSON, filePath

  const { data: cachedProposalsByPaths, file } = getCachedProposalsByPathsDir(pathHash)
  let proposal = cachedProposalsByPaths[proposalId]
  if (proposal) return { proposal, fromCache: true }


  const proposalC = contract || getProposalContract()
  proposal = await proposalC.callSmartContractGetFunc('getProposal', [parseInt(proposalId)])

  //check if proposal Yaml is in cache
  let cachedYamls = []
  const cachedProposalDir = `${nationExportsDir}/${path}/${year}/proposals`
  if (fs.existsSync(cachedProposalDir)) {
    cachedYamls = fs.readdirSync(cachedProposalDir);
  }
  if (cachedYamls.length > 0) {
    let regex = new RegExp("^" + proposalId + "_proposal");
    let cacheYaml = cachedYamls.filter(value => regex.test(value))
    if (cacheYaml.length > 0) {
      filePath = `${cachedProposalDir}/${cacheYaml[0]}`
    }
  }

  if (!filePath) { // if not found in cache then search blockchain
    filePath = `${tmpPropDir}/main-${proposal.yamlBlock}.yaml`
    if (!fs.existsSync(filePath) && Object.keys(proposal).length > 0) {
      let outputFiles = await fetchProposalYaml(proposalC, proposal.yamlBlock, 1)
      await splitFile.mergeFiles(outputFiles, filePath)
      outputFiles.map(f => fs.existsSync(f) && fs.unlinkSync(f))
    }
  }

  try {
    yamlJSON = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  } catch (e) {
    console.log('getProposalData:', e.message)
    yamlJSON = {}
  }

  return yamlJSON
}

/**
 * Check if proposals are already in cache and  fetch
 * @param {string} path 
 * @returns json information of cached proposals 
 */
const getCachedProposalsByPathsDir = path => {
  const cachedProposalsByPathsDir = dir.join(homedir, '.cache', 'proposals_by_paths')
  const cachedProposalsByPaths = dir.join(cachedProposalsByPathsDir, path)
  try {
    if (!fs.existsSync(cachedProposalsByPathsDir)) {
      fs.mkdirSync(cachedProposalsByPathsDir, { recursive: true });
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
  getProposalTemplate,
  proposalRating,
  proposalFeedback,
  userFeedback,
  getProposalDetails,
  getPathProposalsByYear,
  getProposalYaml
}
