const fs = require('fs')
const dir = require('path')
const PromisePool = require('@supercharge/promise-pool')
const splitFile = require('split-file');
const yaml = require('js-yaml')
const { mean, get, isEmpty } = require('lodash');
const { getCitizen } = require('./citizens')
const { APP_PATH } = require('../config')
const { convertStringToHash } = require('../utils/web3')
const { convertStringDollarToNumeric, abbreviateNumber } = require('../utils/helpers')
const { getProposalContract, getFeedbackContract, getVoteContract } = require('../utils/contract')
const { getGithubTemplate } = require('../utils/github')
const { exportsDirNation, voteDataRollupsFile } = require('../utils/common')
const homedir = APP_PATH || require('os').homedir()
const tmpPropDir = dir.join(homedir, '/tmp')
const contractIdentifier = "ZTMProposal"

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
const fetchProposalYaml = async (proposalContract, yamlBlockKey, index, allOutputs = [], initialHash, finalIndex) => {
  const yamlBlock = await proposalContract.callSmartContractGetFunc('getProposalYamlBlock', [yamlBlockKey])
  const initHash = initialHash || yamlBlockKey
  const outpuFileName = `${tmpPropDir}/${initHash}-${index}`;
  fs.writeFileSync(outpuFileName, yamlBlock.content, 'utf-8');
  allOutputs.push(outpuFileName)
  if (yamlBlock.nextYamlBlock !== "" && !finalIndex) {
    await fetchProposalYaml(proposalContract, yamlBlock.nextYamlBlock, index + 1, allOutputs, initHash)
  }
  return allOutputs
}

/**
 * Finds stolen years from the yaml Content
 * @param {object} yamlContent 
 * @returns Array of years
 */
const yamlStolenYears = (yamlContent) => {
  let years = []
  Object.keys(yamlContent).forEach((key) => {
    let val = parseInt(key.replace('stolen_', ''))
    if (!isNaN(val)) {
      years.push(val)
    }
  })
  return years
}
/**
 * Gives proposal theft years amount info and total theft Amount
 * @param {object} file 
 * @returns theftYears - a years wise thefmt amount
 * @returns theftAmt - total theftAmount of a proposal.
 */
const proposalYearTheftInfo = (file) => {
  let theftYears = {}
  let theftAmt = 0
  yamlStolenYears(file).forEach((y) => {
    if (`stolen_${y}` in file) {
      theftYears[y] = convertStringDollarToNumeric(file[`stolen_${y}`])
      theftAmt += theftYears[y]
    }
  })
  return { theftYears, theftAmt }
}

/**
 * Get the version of proposal contract version
 * @param {object} proposalContract Instance of proposal contract
 * @returns Object with proposal contract version information
 */
const getProposalContractVersion = async (proposalContract = null) => {
  if (!proposalContract) {
    proposalContract = await getProposalContract()
  }
  try {
    const version = await proposalContract.callSmartContractGetFunc('getContractVersion')
    return {
      success: true,
      version
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
/**
 * Get the proposal ID by proposal index.
 * @param {string} proposalIndex index of a specific proposal
 * @param {object} proposalContract instance of a proposal contract
 * @returns Object with information of proposal ID
 */
const getProposalIDByIndex = async (proposalIndex, proposalContract = null) => {
  if (!proposalContract) {
    proposalContract = await getProposalContract()
  }
  try {
    const contractVersion = await proposalContract.callSmartContractGetFunc('getContractVersion',)

    return {
      success: true,
      proposalIndex,
      proposalID: `${contractIdentifier}:${contractVersion}:${proposalIndex}`
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
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
      let proposalIds = await contract.callSmartContractGetFunc('getproposalIndicesByCursor', [cursor, howMany])
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
const getProposalDetails = async (proposalId, proposalContract = null) => {
  if (!proposalContract) {
    proposalContract = getProposalContract()
  }
  const proposal = await proposalContract.callSmartContractGetFunc('getProposal', [proposalId])
  const filePath = `${tmpPropDir}/main-${proposal.yamlBlock}.yaml`
  if (!fs.existsSync(filePath) && Object.keys(proposal).length > 0) {
    const proposalYaml = await proposalContract.callSmartContractGetFunc('getProposalYaml', [proposal.yamlBlock])
    let outputFiles = await fetchProposalYaml(proposalContract, proposalYaml.firstBlock, 1)
    await splitFile.mergeFiles(outputFiles, filePath)

  }


  let { proposalVotes } = await voteDataRollupsFile()

  let file = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  let { theftYears, theftAmt } = proposalYearTheftInfo(file)
  let summary = `$${abbreviateNumber(theftAmt)}`
  //get ratings of proposal
  const feedbacks = await proposalFeedback(proposalId, proposalContract)
  const ratings = get(feedbacks, 'ratingData', 0)
  const complaints = get(feedbacks, 'complaintData', 0)
  if (fs.existsSync(filePath))
    fs.unlinkSync(filePath)
  // outputFiles.map(f => fs.existsSync(f) && fs.unlinkSync(f))

  return {
    id: proposalId,
    theftAmt,
    votes: !isEmpty(proposalVotes) ? get(proposalVotes, proposalId, []) : [],
    detail: file || {},
    proposal_hash: proposal.yamlBlock,
    date: new Date(proposal.date * 1000),
    summary,
    title: file && (file.title || file.Title) ? file.title || file.Title : 'No Title available',
    description: file && file.describe_problem_area ? file.describe_problem_area : 'No Description available',
    ratings,
    complaints,
    theftYears
  }
}

const getProposals = async (proposalIDs, proposalContract = null) => {
  if (!proposalContract) {
    proposalContract = getProposalContract()
    proposalContract.init()
  }
  const verRes = await getProposalContractVersion(contract)

  const promises = proposalIDs.map(async (proposalIndex) => {
    const proposalID = `${contractIdentifier}:${verRes.version}:${proposalIndex}`
    const proposalDetail = await proposalContract.callSmartContractGetFunc('getProposal', [proposalID])
    const votesContract = getVoteContract()
    votesContract.init()
    // const votingDetail = await votesContract.callSmartContractGetFunc('getProposalVotesInfo', [proposalIndex])
    let { proposalVotes } = await voteDataRollupsFile()

    const mainProposal = {
      "id": proposalIndex,
      "owner": proposalDetail[0],
      "summary": proposalDetail[1],
      "votes": !isEmpty(proposalVotes) ? get(proposalVotes, proposalID, []) : [],
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
  return contract.createTransaction('holonVote', [true, body.proposalId, body.altTheftAmounts, body.comment || '', body.voter, body.signedMessage, body.priorVoteId], undefined, undefined, 'proxy')
}

/*
* Fetch proposal template based on path and return yaml content
*/
const getProposalTemplate = path => {
  return getGithubTemplate(path)
}
/**
 * Get the rating information of a particular proposal
 * @param {object} feedbackContract - instance of a feedback contract
 * @param {string} proposalID - address of a proposal
 * @returns json object with proposal rating information
 */const proposalRating = async (feedbackContract, proposalID) => {
  try {
    const feedbackers = await feedbackContract.callSmartContractGetFunc('totalProposalRaters', [proposalID])

    let ratingPromises = feedbackers.map(async (feedbacker) => {
      const feedback = await feedbackContract.callSmartContractGetFunc('getProposalRating', [proposalID, feedbacker])
      return parseInt(feedback.rating)
    })
    const allRatings = await Promise.all(ratingPromises)
    return { success: true, count: feedbackers.length, rating: mean(allRatings) || 0 }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Get Proposal comments provided by citizen
 * @param {object} feedbackContract - feeback contract instance
 * @param {string} proposalID - address of a proposal
 * @returns proposal comments data as JSON
 */
const proposalComplaints = async (feedbackContract, proposalID) => {
  try {
    let complaints = {}
    const complainers = await feedbackContract.callSmartContractGetFunc('totalProposalCommentors', [proposalID])
    let complaintPromises = complainers.map(async (complainer) => {
      const countComplaints = await feedbackContract.callSmartContractGetFunc('countCitizenCommentsToProposal', [proposalID, complainer]);
      const citizenInfo = await getCitizen(complainer);
      for (let i = 1; i <= parseInt(countComplaints); i++) {
        let complaintInfo = await feedbackContract.callSmartContractGetFunc('getCitizenCommentToProposal', [proposalID, complainer, i]);
        complaints[complaintInfo.date] = { complainer: citizenInfo.name, description: complaintInfo.description, date: complaintInfo.date }
      }
    })
    await Promise.all(complaintPromises)

    return { success: true, count: Object.keys(complaints).length, allComplaints: complaints }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
/**
 * Get proposal feedback(both rating and comments)
 * @param {string} proposalID - address of a proposal
 * @param {object} feedbackContract - instance of a feedback contract
 * @returns proposal ratings and comments data as JSON
 */
const proposalFeedback = async (proposalID, feedbackContract = null) => {
  if (!feedbackContract) {
    feedbackContract = getFeedbackContract()
    feedbackContract.init()
  }
  const ratingData = await proposalRating(feedbackContract, proposalID);
  const commentData = await proposalComplaints(feedbackContract, proposalID);
  if (!ratingData.success || !commentData.success) {
    return { success: false, error: ratingData.error || commentData.error };
  }
  return { success: true, ratingData, commentData };
}
/**
 * Get individual citizen's feedback on a specific Proposal
 * @param {string} proposalID - address of a proposal
 * @param {string} citizenAddress - address of a citizen
 * @param {object} feedbackContract - instance of a feedback contract
 * @returns rating and comments passed by specific citizen
 */
const citizenFeedback = async (proposalID, citizenAddress, feedbackContract = null) => {
  try {
    if (!feedbackContract) {
      feedbackContract = getFeedbackContract()
      feedbackContract.init()
    }
    const complaints = {}
    const feedback = await feedbackContract.callSmartContractGetFunc('getProposalRating', [proposalID, citizenAddress])
    const countComplaints = await feedbackContract.callSmartContractGetFunc('countCitizenCommentsToProposal', [proposalID, citizenAddress]);
    const citizenInfo = await getCitizen(citizenAddress);
    for (let i = 1; i <= parseInt(countComplaints); i++) {
      let complaintInfo = await feedbackContract.callSmartContractGetFunc('getCitizenCommentToProposal', [proposalID, citizenAddress, i]);
      complaints[complaintInfo.date] = { complainer: citizenInfo.name, description: complaintInfo.description, date: complaintInfo.date }
    }
    return { success: true, ratingData: { rating: parseInt(feedback.rating), createdAt: feedback.createdAt, updatedAt: feedback.updatedAt }, complaintData: complaints };
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Returns proposal details by path. Eventhough this method tries to fetch the proposals based on path
 * @param {string} path 
 * @param {Object} contract 
 * @param {Object} voterContract 
 * @returns proposal JSONs
 */
const getPathProposalsByPath = async (path, contract, voterContract) => {
  const pathHash = convertStringToHash(path)
  const proposalC = contract || getProposalContract()
  // const voterC = voterContract || getVoteContract()

  const { data: cachedProposalsByPaths, file } = getCachedProposalsByPathsDir(pathHash)
  //get cachedproposal
  let cachedFiles = [], newProposals = {}
  const cachedProposalDir = `${exportsDirNation}/${path}/proposals`
  if (fs.existsSync(cachedProposalDir)) {
    cachedFiles = fs.readdirSync(cachedProposalDir);
  }
  const verRes = await getProposalContractVersion(contract)
  let { propIds } = await proposalC.callSmartContractGetFunc('allProposalsByPath', [pathHash])
  let { results, errors } = await PromisePool
    .withConcurrency(1)
    .for(propIds)
    .process(async pid => {
      try {
        pid = `${contractIdentifier}:${verRes.version}:${pid}`

        let pData = await getProposalData(pid, cachedProposalsByPaths, proposalC, cachedFiles, path)

        let { proposalVotes } = await voteDataRollupsFile()
        //   const voterRes = await voterC.callSmartContractGetFunc('getProposalVotesInfo', [pid])
        const feedbacks = await proposalFeedback(pid, proposalC)

        const ratings = get(feedbacks, 'ratingData', 0)
        const complaints = get(feedbacks, 'complaintData', 0)
        if (!pData.fromCache) {
          newProposals[pid] = pData.proposal
        }
        return {
          ...pData.proposal,
          votes: !isEmpty(proposalVotes) ? get(proposalVotes, pid, []).length : 0,
          ratings,
          complaints
        }
      } catch (e) {
        console.log('getPathProposalsByPath', pid, e)
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
const getProposalData = async (proposalId, cachedProposalsByPaths, proposalC, cachedYamls, path) => {
  let filePath
  let theftYears = {}
  let theftAmt = 0

  let proposal = cachedProposalsByPaths[proposalId]
  // if (proposal) return { proposal, fromCache: true }

  const { proposal: tmpProposal, yamlJSON: file } = await getYamlFromCacheOrSmartContract(proposalId, path, proposalC, cachedYamls)
  proposal = tmpProposal
  yamlStolenYears(file).forEach((y) => {
    if (`stolen_${y}` in file) {
      theftYears[y] = convertStringDollarToNumeric(file[`stolen_${y}`])
      theftAmt += theftYears[y]
    }
  })
  if (fs.existsSync(filePath))
    fs.unlinkSync(filePath)
  return {
    proposal: {
      id: proposalId,

      date: new Date(proposal.date * 1000),
      summary: `$${abbreviateNumber(theftAmt)}`,
      author: file && file.author,
      title: file && (file.title || file.Title) ? file.title || file.Title : 'No Title available',
      description: file && file.describe_problem_area ? file.describe_problem_area : 'No Description available',
      theftAmt,
      theftYears
    }, fromCache: false
  }
}

/**
 * Returns proposal yaml either from cache or from blockchain
 * @param {integer} proposalId 
 * @param {String} path 
 * @param {Object} contract 
 * @returns Proposal's YAML object
 */
const getProposalYaml = async (proposalId, path, contract) => {
  const { yamlJSON } = await getYamlFromCacheOrSmartContract(proposalId, path, contract)

  return yamlJSON
}

/**
 * Returns proposal yaml either from cache or from blockchain
 * @param {integer} proposalId 
 * @param {String} path 
 * @param {Object} contract 
 * @param {Object} cachedYamls 
 * @returns Proposal's YAML object
 */
const getYamlFromCacheOrSmartContract = async (proposalId, path, contract, cachedYamls) => {
  let yamlJSON, filePath
  const proposalC = contract || getProposalContract()
  const proposal = await proposalC.callSmartContractGetFunc('getProposal', [proposalId])
  //check if proposal Yaml is in cache
  const cachedProposalDir = `${exportsDirNation}/${path}/proposals`

  if (!cachedYamls && path) {
    cachedYamls = []
    if (fs.existsSync(cachedProposalDir)) {
      cachedYamls = fs.readdirSync(cachedProposalDir);
    }
  }

  if (cachedYamls && cachedYamls.length > 0) {
    let regex = new RegExp("^" + proposalId + "_proposal");
    let cacheYaml = cachedYamls.filter(value => regex.test(value))
    if (cacheYaml.length > 0) {
      filePath = `${cachedProposalDir}/${cacheYaml[0]}`
    }
  }
  if (!filePath) { // if not found in cache then search blockchain
    filePath = `${tmpPropDir}/main-${proposal.yamlBlock}.yaml`

    if (!fs.existsSync(filePath) && Object.keys(proposal).length > 0) {
      const proposalYaml = await proposalC.callSmartContractGetFunc('getProposalYaml', [proposal.yamlBlock])
      let outputFiles = await fetchProposalYaml(proposalC, proposalYaml.firstBlock, 1)
      await splitFile.mergeFiles(outputFiles, filePath)
      // outputFiles.map(f => fs.existsSync(f) && fs.unlinkSync(f))
    }
  }

  yamlJSON = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  if (fs.existsSync(filePath))
    fs.unlinkSync(filePath)
  return { proposal, yamlJSON }
}

/**
 * Read path specific cache file while fetching proposals.
 * @param {string} path Bytes value of the path string
 * @returns JSON object with proposal cache information
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
  contractIdentifier,
  getProposals,
  yamlStolenYears,
  getProposalIDByIndex,
  proposalYearTheftInfo,
  getProposalContractVersion,
  allProposals,
  listProposalIds,
  proposalsFromEvents,
  voteByHolon,
  fetchProposalYaml,
  getProposalTemplate,
  proposalRating,
  proposalFeedback,
  citizenFeedback,
  getProposalDetails,
  getPathProposalsByPath,
  getProposalYaml
}
