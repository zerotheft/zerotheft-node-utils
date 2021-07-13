const fs = require('fs')
const { get, remove, uniq } = require('lodash')
const { getProposalContract, getVoteContract } = require('../utils/contract')
const { convertStringToHash } = require('../utils/web3')
const { getProposalDetails } = require('./proposals')
const { exportsDirNation, citizenSpecificVotesFile, proposalVotesFile, proposalArchiveVotesFile, proposalVotersFile, writeFile, voteDataRollupsFile } = require('../utils/common')
const contractIdentifier = "ZTMVote"
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
    const version = await voteContract.callSmartContractGetFunc('getContractVersion')
    return {
      success: true,
      version
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
const updateVoteDataRollups = async (rollups, voteData, proposalInfo, voterC) => {
  // keep the roll ups record in file
  let _voter = get(rollups.citizenSpecificVotes, (voteData.voter).toLowerCase(), {})
  let _vote = get(_voter, (proposalInfo.path), (voteData.voteID))
  _voter[(proposalInfo.path)] = _vote
  rollups.citizenSpecificVotes[(voteData.voter).toLowerCase()] = _voter

  // if prior Vote is present
  if (voteData.voteReplaces !== "") {
    const _priorVote = await voterC.callSmartContractGetFunc('getVote', [voteData.voteReplaces])
    let _priorPropID = _priorVote.voteIsTheft ? _priorVote.yesTheftProposal : _priorVote.noTheftProposal
    let _priorPVotes = get(rollups.proposalVotes, (_priorPropID), [])
    remove(_priorPVotes, (_v) => {
      return (_v === voteData.voteReplaces)
    })
    let _pArchiveVotes = get(rollups.proposalArchiveVotes, (voteData.proposalID), [])
    _pArchiveVotes.push((voteData.voteReplaces))
    rollups.proposalArchiveVotes[(voteData.proposalID)] = uniq(_pArchiveVotes)
  }

  let _pvotes = get(rollups.proposalVotes, (voteData.proposalID), [])
  _pvotes.push((voteData.voteID))
  rollups.proposalVotes[(voteData.proposalID)] = uniq(_pvotes)

  let _pvoters = get(rollups.proposalVoters, (voteData.proposalID), [])
  _pvoters.push((voteData.voter).toLowerCase())
  rollups.proposalVoters[(voteData.proposalID)] = uniq(_pvoters)
}

//save vote roll ups date
const saveVoteRollupsData = async (voteData) => {
  if (!fs.existsSync(exportsDirNation)) {
    fs.mkdirSync(exportsDirNation, { recursive: true });
  }
  if (voteData.citizenSpecificVotes) await writeFile(citizenSpecificVotesFile, voteData.citizenSpecificVotes)
  if (voteData.proposalVotes) await writeFile(proposalVotesFile, voteData.proposalVotes)
  if (voteData.proposalVoters) await writeFile(proposalVotersFile, voteData.proposalVoters)
  if (voteData.proposalArchiveVotes) await writeFile(proposalArchiveVotesFile, voteData.proposalArchiveVotes)
}
/*
* Get citizen earlier vote to the proposal
*/
const citizenPriorVote = async body => {
  const voterC = getVoteContract()
  const proposalC = getProposalContract()
  try {
    if (!body.address) throw new Error('citizen address not present for prior vote')

    let { citizenSpecificVotes } = await voteDataRollupsFile()
    // let priorvoteID = await voterC.callSmartContractGetFunc('getCitizenSpecificVote', [body.address, convertStringToHash(body.url)])
    let priorvoteID = (!isEmpty(citizenSpecificVotes) && citizenSpecificVotes[body.address]) ? get(citizenSpecificVotes[body.address], convertStringToHash(body.url), 0) : 0
    if (priorvoteID <= 0) throw new Error('no prior votes')
    const vote = await voterC.callSmartContractGetFunc('getVote', [priorvoteID])
    let proposalID = vote.voteIsTheft ? vote.yesTheftProposal : vote.noTheftProposal
    const proposal = await getProposalDetails(proposalID, proposalC)

    return { success: true, id: priorvoteID, pid: proposal.id, ...vote }
  }
  catch (e) {
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
    const voteIndex = body.voteIndex
    if (!voteIndex) throw new Error('vote voteIndex not present')
    const voteID = `${contractIdentifier}:${voteRes.version}:${voteIndex}`
    let { voter, voteIsTheft, yesTheftProposal, noTheftProposal } = await voterC.callSmartContractGetFunc('getVote', [voteID])
    const { voteReplaces } = await voterC.callSmartContractGetFunc('getVoteExtra', [voteID])
    let proposalID = voteIsTheft ? yesTheftProposal : noTheftProposal
    const proposalInfo = await proposalC.callSmartContractGetFunc('getProposal', [proposalID])

    let { citizenSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes } = await voteDataRollupsFile()

    // keep the roll ups record in file
    await updateVoteDataRollups({ citizenSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes }, { voter, voteID, proposalID, voteReplaces }, proposalInfo, voterC)

    //save all the rollups
    await saveVoteRollupsData({ citizenSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes })

    return { success: true, message: 'vote data rollups complete' }
  }
  catch (e) {
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
  let cursor = 0;
  let howMany = 1000; // Get thousands at a time
  let allIds = []
  try {
    do {
      let voteIds = await contract.callSmartContractGetFunc('getVoteIndicesByCursor', [cursor, howMany])
      allIds = allIds.concat(voteIds)
      cursor = cursor + howMany
    } while (1)
  }
  catch (e) {
    console.log(e.message)
  }
  return allIds
}

/*
* Get all votes
*/
const getAllVoteIds = async () => {
  const contract = getVoteContract()
  try {
    let allVoteIds = await listVoteIds(contract)
    // allVoteIds=
    // const promises = allVoteIds.map(async (voteID) => {
    let allVotes = []
    for (let i = 0; i < allVoteIds.length; i++) {
      let voteID = allVoteIds[i]
      console.log('voteID about to export is ', voteID)
      try {
        const vote = await contract.callSmartContractGetFunc('getVote', [parseInt(voteID)])
        const { voter, voteIsTheft, proposalID, customTheftAmount, comment, date } = vote
        const voteExtra = await contract.callSmartContractGetFunc('getVoteExtra', [parseInt(voteID)])
        const { holon, voteReplaces, voteReplacedBy } = voteExtra

        allVotes.push({
          "id": voteID,
          voter,
          voteType: voteIsTheft,
          "proposal": proposalID,
          altTheftAmt: customTheftAmount,
          comment,
          holon,
          voteReplaces,
          voteReplacedBy,
          "timestamp": date
        })

        // return voteData
      } catch (e) {
        var voterLog = fs.createWriteStream('/tmp/error-votes.log', { flags: 'a' })
        var message = new Date().toISOString() + " : voteId=>" + voteID + "\n";
        voterLog.write(message);

        console.log(e)
        continue
      }
    }
    // const allVotes = await Promise.all(promises)
    return { success: true, allVotes }
  }
  catch (e) {
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
  saveVoteRollupsData
}
