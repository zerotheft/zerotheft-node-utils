/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */
const fs = require('fs')
const { get, remove, uniq, isEmpty } = require('lodash')
const { getProposalContract, getVoteContract } = require('../utils/contract')
const { convertStringToHash } = require('../utils/web3')
const { getProposalDetails } = require('./proposals')
const {
  exportsDirNation,
  citizenSpecificVotesFile,
  proposalVotesFile,
  proposalArchiveVotesFile,
  proposalVotersFile,
  hierarchyAreaVotesFile,
  writeFile,
  voteDataRollupsFile,
} = require('../utils/common')

const contractIdentifier = 'ZTMVote'
/**
 * Get the version of vote contract version
 * @param {object} voteContract Instance of vote contract
 * @returns Object with vote contract version information
 */
const getVoteContractVersion = async (voteContract = null) => {
  if (!voteContract) {
    voteContract = await getVoteContract()
  }
  try {
    const versionNumber = await voteContract.callSmartContractGetFunc('getContractVersion')
    return {
      success: true,
      version: `v${versionNumber}`,
      number: versionNumber,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

const updateVoteDataRollups = async (rollups, voteData, proposalInfo, voterC) => {
  // keep the roll ups record in file
  const _voter = get(rollups.citizenSpecificVotes, voteData.voter.toLowerCase(), {})
  // if this citizen already gave a vote to this path then get the vote data(vote_id,vote_time)
  const _priorVoteData = get(_voter, proposalInfo.path, {})

  _voter[proposalInfo.path] = { vote_id: voteData.voteID, vote_time: voteData.castedOn }
  rollups.citizenSpecificVotes[voteData.voter.toLowerCase()] = _voter

  // if prior Vote is present; i.e _priorVoteData is not empty and priorVote casted time earlier than the current voteData casted time
  if (!isEmpty(_priorVoteData) && _priorVoteData.vote_time < voteData.castedOn) {
    const _priorVote = await voterC.callSmartContractGetFunc('getVote', [_priorVoteData.vote_id])
    const _priorPropID = _priorVote.voteIsTheft === 'True' ? _priorVote.yesTheftProposal : _priorVote.noTheftProposal
    const _priorPVotes = get(rollups.proposalVotes, _priorPropID, [])

    // remove(_priorPVotes, _v => _v === voteData.voteReplaces)
    remove(_priorPVotes, _v => _v === _priorVoteData.vote_id)
    const _pArchiveVotes = get(rollups.proposalArchiveVotes, _priorPropID, [])
    _pArchiveVotes.push(_priorVoteData.vote_id)
    rollups.proposalArchiveVotes[_priorPropID] = uniq(_pArchiveVotes)
  } else {
    // if it is a new vote
    // Read the hierarchy area votes file
    const _areaVoteCount = get(rollups.hierarchyAreaVotes, voteData.votedPath, 0)
    rollups.hierarchyAreaVotes[voteData.votedPath] = _areaVoteCount + 1
  }

  const _pvotes = get(rollups.proposalVotes, voteData.proposalID, [])
  _pvotes.push(voteData.voteID)
  rollups.proposalVotes[voteData.proposalID] = uniq(_pvotes)

  const _pvoters = get(rollups.proposalVoters, voteData.proposalID, [])
  _pvoters.push(voteData.voter.toLowerCase())
  rollups.proposalVoters[voteData.proposalID] = uniq(_pvoters)
}

// save vote roll ups date
const saveVoteRollupsData = async voteData => {
  if (!fs.existsSync(exportsDirNation)) {
    fs.mkdirSync(exportsDirNation, { recursive: true })
  }
  if (voteData.citizenSpecificVotes) {
    await writeFile(citizenSpecificVotesFile, voteData.citizenSpecificVotes)
  }
  if (voteData.proposalVotes) {
    await writeFile(proposalVotesFile, voteData.proposalVotes)
  }
  if (voteData.proposalVoters) {
    await writeFile(proposalVotersFile, voteData.proposalVoters)
  }
  if (voteData.proposalArchiveVotes) {
    await writeFile(proposalArchiveVotesFile, voteData.proposalArchiveVotes)
  }
  if (voteData.hierarchyAreaVotes) {
    await writeFile(hierarchyAreaVotesFile, voteData.hierarchyAreaVotes)
  }
}
/*
 * Get citizen earlier vote to the proposal
 */
const citizenPriorVote = async body => {
  const voterC = getVoteContract()
  const proposalC = getProposalContract()
  try {
    if (!body.address) throw new Error('citizen address not present for prior vote')

    const { citizenSpecificVotes } = await voteDataRollupsFile()
    // let priorvoteID = await voterC.callSmartContractGetFunc('getCitizenSpecificVote', [body.address, convertStringToHash(body.url)])
    const citizenAddress = body.address.toLowerCase()
    const priorvoteID =
      !isEmpty(citizenSpecificVotes) && citizenSpecificVotes[citizenAddress]
        ? get(citizenSpecificVotes[citizenAddress], convertStringToHash(body.url), 0)
        : 0
    if (priorvoteID <= 0) throw new Error('no prior votes')
    const vote = await voterC.callSmartContractGetFunc('getVote', [priorvoteID.vote_id])
    const proposalID = vote.voteIsTheft === 'True' ? vote.yesTheftProposal : vote.noTheftProposal
    const proposal = await getProposalDetails(proposalID, proposalC)

    return { success: true, id: priorvoteID.vote_id, pid: proposal.id, ...vote }
  } catch (e) {
    console.log('citizenPriorVote::', e.message)
    return { success: false, error: e.message }
  }
}

/**
 * Rollups the vote Data
 * @param {object} body Payload containing voteInformation
 * @returns Json object with success or failure message
 */
const voteDataRollups = async body => {
  const voterC = getVoteContract()
  const proposalC = getProposalContract()
  try {
    const voteRes = await getVoteContractVersion(voterC)
    const { voteIndex } = body
    if (!voteIndex) throw new Error('vote voteIndex not present')
    const voteID = `${contractIdentifier}:${voteRes.version}:${voteIndex}`
    const { voter, voteIsTheft, yesTheftProposal, noTheftProposal, date } = await voterC.callSmartContractGetFunc(
      'getVote',
      [voteID]
    )
    const proposalID = voteIsTheft === 'True' ? yesTheftProposal : noTheftProposal
    const proposalInfo = await proposalC.callSmartContractGetFunc('getProposal', [proposalID])

    const { citizenSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes } = await voteDataRollupsFile()

    // keep the roll ups record in file
    await updateVoteDataRollups(
      { citizenSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes },
      { voter, voteID, proposalID, castedOn: date },
      proposalInfo,
      voterC
    )

    // save all the rollups
    await saveVoteRollupsData({ citizenSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes })

    return { success: true, message: 'vote data rollups complete' }
  } catch (e) {
    console.log('voteDataRollups::', e)
    return { success: false, error: e.message }
  }
}

/*
 * List vote ids only
 */
const listVoteIds = async (contract = null) => {
  if (!contract) {
    contract = getVoteContract()
  }
  const verRes = await getVoteContractVersion(contract)
  const allVotes = {}
  let allVotesCount = 0
  while (verRes.number > 0) {
    let versionVotes = []

    let cursor = 0
    const howMany = 1000 // Get thousands at a time
    try {
      do {
        const voteIds = await contract.callSmartContractGetFunc('getVoteIndicesByCursor', [
          cursor,
          howMany,
          verRes.number,
        ])
        versionVotes = versionVotes.concat(voteIds)
        cursor += howMany
      } while (1)
    } catch (e) {
      console.log(e.message)
    }
    allVotes[verRes.version] = versionVotes
    allVotesCount += versionVotes.length
    verRes.number--
  }
  return { allVotes, allVotesCount }
}
/*
 * Get all votes
 */
const getAllVoteIds = async () => {
  const contract = getVoteContract()
  try {
    const allVoteIds = await listVoteIds(contract)
    // allVoteIds=
    // const promises = allVoteIds.map(async (voteID) => {
    const allVotes = []
    for (let i = 0; i < allVoteIds.length; i++) {
      const voteID = allVoteIds[i]
      console.log('voteID about to export is ', voteID)
      try {
        const vote = await contract.callSmartContractGetFunc('getVote', [parseInt(voteID)])
        const { voter, voteIsTheft, proposalID, customTheftAmount, comment, date } = vote
        const voteExtra = await contract.callSmartContractGetFunc('getVoteExtra', [parseInt(voteID)])
        const { holon, voteReplaces, voteReplacedBy } = voteExtra

        allVotes.push({
          id: voteID,
          voter,
          voteType: voteIsTheft === 'True',
          proposal: proposalID,
          altTheftAmt: customTheftAmount,
          comment,
          holon,
          voteReplaces,
          voteReplacedBy,
          timestamp: date,
        })

        // return voteData
      } catch (e) {
        const voterLog = fs.createWriteStream('/tmp/error-votes.log', { flags: 'a' })
        const message = `${new Date().toISOString()} : voteId=>${voteID}\n`
        voterLog.write(message)

        console.log(e)
        continue
      }
    }
    // const allVotes = await Promise.all(promises)
    return { success: true, allVotes }
  } catch (e) {
    console.log(e)
    return { success: false, error: e.message }
  }
}
module.exports = {
  contractIdentifier,
  getVoteContractVersion,
  citizenPriorVote,
  listVoteIds,
  getAllVoteIds,
  voteDataRollups,
  updateVoteDataRollups,
  saveVoteRollupsData,
}
