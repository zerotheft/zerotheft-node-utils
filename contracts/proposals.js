const fs = require('fs')
const dir = require('path')
const PromisePool = require('@supercharge/promise-pool')
const splitFile = require('split-file')
const yaml = require('js-yaml')
const { mean, get, isEmpty } = require('lodash')
const { getCitizen, getCitizenIdByAddress } = require('./citizens')
const { APP_PATH } = require('../config')
// eslint-disable-next-line import/order
const homedir = APP_PATH || require('os').homedir()
const { convertStringToHash } = require('../utils/web3')
const { convertStringDollarToNumeric, abbreviateNumber } = require('../utils/helpers')
const { getProposalContract, getFeedbackContract, getVoteContract } = require('../utils/contract')
const { getFeedbackContractVersion } = require('./feedbacks')
const { getGithubTemplate } = require('../utils/github')
const { exportsDirNation, voteDataRollupsFile } = require('../utils/common')

const tmpPropDir = dir.join(homedir, '/tmp')
const contractIdentifier = 'ZTMProposal'

if (!fs.existsSync(tmpPropDir)) {
  fs.mkdirSync(tmpPropDir, { recursive: true })
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
  const outpuFileName = `${tmpPropDir}/${initHash}-${index}`
  fs.writeFileSync(outpuFileName, yamlBlock.content, 'utf-8')
  allOutputs.push(outpuFileName)
  if (yamlBlock.nextYamlBlock !== '' && !finalIndex) {
    await fetchProposalYaml(proposalContract, yamlBlock.nextYamlBlock, index + 1, allOutputs, initHash)
  }
  return allOutputs
}

/**
 * Finds stolen years from the yaml Content
 * @param {object} yamlContent
 * @returns Array of years
 */
const yamlStolenYears = yamlContent => {
  const years = []
  Object.keys(yamlContent).forEach(key => {
    const val = parseInt(key.replace('stolen_', ''))
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
const proposalYearTheftInfo = file => {
  const theftYears = {}
  let theftAmt = 0
  yamlStolenYears(file).forEach(y => {
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
    const versionNumber = await proposalContract.callSmartContractGetFunc('getContractVersion')
    return {
      success: true,
      version: `v${versionNumber}`,
      number: versionNumber,
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
    const contractVersion = await proposalContract.callSmartContractGetFunc('getContractVersion')

    return {
      success: true,
      proposalIndex,
      proposalID: `${contractIdentifier}:${contractVersion}:${proposalIndex}`,
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
  const verRes = await getProposalContractVersion(contract)
  const allProposals = {}
  let allProposalsCount = 0
  while (verRes.number > 0) {
    let versionProposals = []
    let cursor = 0
    const howMany = 1000 // Get thousands at a time
    try {
      do {
        const proposalIds = await contract.callSmartContractGetFunc('getproposalIndicesByCursor', [
          cursor,
          howMany,
          verRes.number,
        ])
        versionProposals = versionProposals.concat(proposalIds)
        cursor += howMany
      } while (1)
    } catch (e) {
      console.log(e.message)
    }
    allProposals[verRes.version] = versionProposals
    allProposalsCount += versionProposals.length
    verRes.number--
  }
  return { allProposals, allProposalsCount }
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
    const outputFiles = await fetchProposalYaml(proposalContract, proposalYaml.firstBlock, 1)
    await splitFile.mergeFiles(outputFiles, filePath)
  }

  const { proposalVotes } = await voteDataRollupsFile()

  const file = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  const { theftYears, theftAmt } = proposalYearTheftInfo(file)
  const summary = `$${abbreviateNumber(theftAmt)}`
  // get ratings of proposal
  const feedbacks = await proposalFeedback(proposalId, proposalContract)
  const ratings = get(feedbacks, 'ratingData', 0)
  const complaints = get(feedbacks, 'complaintData', 0)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
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
    theftYears,
  }
}

const getProposals = async (proposalIDs, proposalContract = null) => {
  if (!proposalContract) {
    proposalContract = getProposalContract()
    proposalContract.init()
  }
  const verRes = await getProposalContractVersion(proposalContract)

  const promises = proposalIDs.map(async proposalIndex => {
    const proposalID = `${contractIdentifier}:${verRes.version}:${proposalIndex}`
    const proposalDetail = await proposalContract.callSmartContractGetFunc('getProposal', [proposalID])
    const votesContract = getVoteContract()
    votesContract.init()
    // const votingDetail = await votesContract.callSmartContractGetFunc('getProposalVotesInfo', [proposalIndex])
    const { proposalVotes } = await voteDataRollupsFile()

    const mainProposal = {
      id: proposalIndex,
      owner: proposalDetail[0],
      summary: proposalDetail[1],
      votes: !isEmpty(proposalVotes) ? get(proposalVotes, proposalID, []) : [],
      proposal_hash: proposalDetail[3],
      created_at: proposalDetail[4],
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
  return contract.createTransaction(
    'holonVote',
    [true, body.proposalId, body.altTheftAmounts, body.comment || '', body.voter, body.signedMessage, body.priorVoteId],
    undefined,
    undefined,
    'proxy'
  )
}

/*
 * Fetch proposal template based on path and return yaml content
 */
const getProposalTemplate = path => getGithubTemplate(path)
/**
 * Get the rating information of a particular proposal
 * @param {object} feedbackContract - instance of a feedback contract
 * @param {string} proposalID - address of a proposal
 * @returns json object with proposal rating information
 */
const proposalRating = async (feedbackContract, proposalID) => {
  try {
    const verRes = await getFeedbackContractVersion(feedbackContract)
    let version = verRes.number
    let allFeedbackers = []
    while (version > 0) {
      const feedbackers = await feedbackContract.callSmartContractGetFunc('totalProposalRaters', [proposalID, version])
      allFeedbackers = allFeedbackers.concat(feedbackers)
      version--
    }

    const ratingPromises = allFeedbackers.map(async feedbacker => {
      const feedback = await feedbackContract.callSmartContractGetFunc('getProposalRating', [proposalID, feedbacker])
      return parseInt(feedback.rating)
    })
    const allRatings = await Promise.all(ratingPromises)
    return { success: true, count: allFeedbackers.length, rating: mean(allRatings) || 0 }
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
    const complaints = {}
    let allComplainers = []
    const verRes = await getFeedbackContractVersion(feedbackContract)
    let version = verRes.number
    while (version > 0) {
      const complainers = await feedbackContract.callSmartContractGetFunc('totalProposalCommentors', [
        proposalID,
        version,
      ])
      allComplainers = allComplainers.concat(complainers)
      version--
    }
    const complaintPromises = allComplainers.map(async complainer => {
      const countRes = await feedbackContract.callSmartContractGetFunc('countCitizenCommentsToProposal', [
        proposalID,
        complainer,
      ])
      const cres = await getCitizenIdByAddress(complainer)
      const citizenInfo = await getCitizen(cres.citizenID)
      for (let i = 1; i <= parseInt(countRes); i++) {
        const complaintInfo = await feedbackContract.callSmartContractGetFunc('getCitizenCommentToProposal', [
          proposalID,
          complainer,
          i,
        ])
        complaints[complaintInfo.createdAt] = {
          complainer: citizenInfo.name,
          description: complaintInfo.description,
          date: complaintInfo.createdAt,
        }
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
  const ratingData = await proposalRating(feedbackContract, proposalID)
  const commentData = await proposalComplaints(feedbackContract, proposalID)
  if (!ratingData.success || !commentData.success) {
    return { success: false, error: ratingData.error || commentData.error }
  }
  return { success: true, ratingData, commentData }
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
    const countRes = await feedbackContract.callSmartContractGetFunc('countCitizenCommentsToProposal', [
      proposalID,
      citizenAddress,
    ])

    const cres = await getCitizenIdByAddress(citizenAddress)
    const citizenInfo = await getCitizen(cres.citizenID)
    for (let i = 1; i <= parseInt(countRes); i++) {
      const complaintInfo = await feedbackContract.callSmartContractGetFunc('getCitizenCommentToProposal', [
        proposalID,
        citizenAddress,
        i,
      ])
      complaints[complaintInfo.createdAt] = {
        complainer: citizenInfo.name,
        description: complaintInfo.description,
        date: complaintInfo.createdAt,
      }
    }
    return {
      success: true,
      ratingData: { rating: parseInt(feedback.rating), createdAt: feedback.createdAt, version: feedback.version },
      complaintData: complaints,
    }
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
  // get cachedproposal
  let cachedFiles = []
  const newProposals = {}
  const cachedProposalDir = `${exportsDirNation}/${path}/proposals`
  if (fs.existsSync(cachedProposalDir)) {
    cachedFiles = fs.readdirSync(cachedProposalDir)
  }
  let allPropsData = []
  const verRes = await getProposalContractVersion(contract)
  while (verRes.number > 0) {
    const { propIds } = await proposalC.callSmartContractGetFunc('allProposalsByPath', [pathHash, verRes.number])
    const { results, errors } = await PromisePool.withConcurrency(1)
      .for(propIds)
      .process(async pid => {
        try {
          pid = `${contractIdentifier}:v${verRes.number}:${pid}`

          const pData = await getProposalData(pid, cachedProposalsByPaths, proposalC, cachedFiles, path)

          const { proposalVotes } = await voteDataRollupsFile()
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
            complaints,
          }
        } catch (e) {
          console.log('getPathProposalsByPath', pid, e)
          return null
        }
      })
    allPropsData = allPropsData.concat(results)
    verRes.number--
  }
  // append new proposals in cache file
  if (!isEmpty(newProposals)) {
    fs.writeFileSync(file, JSON.stringify({ ...cachedProposalsByPaths, ...newProposals }))
  }
  return allPropsData
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
  const theftYears = {}
  let theftAmt = 0

  let proposal = cachedProposalsByPaths[proposalId]
  // if (proposal) return { proposal, fromCache: true }

  const { proposal: tmpProposal, yamlJSON: file } = await getYamlFromCacheOrSmartContract(
    proposalId,
    path,
    proposalC,
    cachedYamls
  )
  proposal = tmpProposal
  yamlStolenYears(file).forEach(y => {
    if (`stolen_${y}` in file) {
      theftYears[y] = convertStringDollarToNumeric(file[`stolen_${y}`])
      theftAmt += theftYears[y]
    }
  })
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  return {
    proposal: {
      id: proposalId,

      date: new Date(proposal.date * 1000),
      summary: `$${abbreviateNumber(theftAmt)}`,
      author: file && file.author,
      title: file && (file.title || file.Title) ? file.title || file.Title : 'No Title available',
      description: file && file.describe_problem_area ? file.describe_problem_area : 'No Description available',
      theftAmt,
      theftYears,
    },
    fromCache: false,
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
  let yamlJSON
  let filePath
  const proposalC = contract || getProposalContract()
  const proposal = await proposalC.callSmartContractGetFunc('getProposal', [proposalId])
  // check if proposal Yaml is in cache
  const cachedProposalDir = `${exportsDirNation}/${path}/proposals`

  if (!cachedYamls && path) {
    cachedYamls = []
    if (fs.existsSync(cachedProposalDir)) {
      cachedYamls = fs.readdirSync(cachedProposalDir)
    }
  }

  if (cachedYamls && cachedYamls.length > 0) {
    const regex = new RegExp(`^${proposalId}_proposal`)
    const cacheYaml = cachedYamls.filter(value => regex.test(value))
    if (cacheYaml.length > 0) {
      filePath = `${cachedProposalDir}/${cacheYaml[0]}`
    }
  }
  if (!filePath) {
    // if not found in cache then search blockchain
    filePath = `${tmpPropDir}/main-${proposal.yamlBlock}.yaml`

    if (!fs.existsSync(filePath) && Object.keys(proposal).length > 0) {
      const proposalYaml = await proposalC.callSmartContractGetFunc('getProposalYaml', [proposal.yamlBlock])
      const outputFiles = await fetchProposalYaml(proposalC, proposalYaml.firstBlock, 1)
      await splitFile.mergeFiles(outputFiles, filePath)
      // outputFiles.map(f => fs.existsSync(f) && fs.unlinkSync(f))
    }
  }

  yamlJSON = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
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
      fs.mkdirSync(cachedProposalsByPathsDir, { recursive: true })
    }

    const rawdata = fs.readFileSync(cachedProposalsByPaths)
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
  getProposalYaml,
}
