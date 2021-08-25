const fs = require('fs')
const { APP_PATH } = require('../config')

const exportsDirNation = `${APP_PATH}/public/exports/nation_data`
const citizenSpecificVotesFile = `${exportsDirNation}/citizen_specific_votes.json`
const proposalVotesFile = `${exportsDirNation}/proposal_votes.json`
const proposalVotersFile = `${exportsDirNation}/proposal_voters.json`
const proposalArchiveVotesFile = `${exportsDirNation}/proposal_archive_votes.json`

const writeFile = async (filePath, input) => {
  const jsonString = JSON.stringify(input)
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, jsonString, err => {
      if (err) {
        reject({ message: err })
      }
      resolve()
    })
  })
}
// returns voting rollups information
const voteDataRollupsFile = async () => {
  const citizenSpecificVotes = fs.existsSync(citizenSpecificVotesFile)
    ? JSON.parse(fs.readFileSync(citizenSpecificVotesFile, 'utf-8'))
    : {}
  const proposalVotes = fs.existsSync(proposalVotesFile) ? JSON.parse(fs.readFileSync(proposalVotesFile, 'utf-8')) : {}
  const proposalVoters = fs.existsSync(proposalVotersFile)
    ? JSON.parse(fs.readFileSync(proposalVotersFile, 'utf-8'))
    : {}
  const proposalArchiveVotes = fs.existsSync(proposalArchiveVotesFile)
    ? JSON.parse(fs.readFileSync(proposalArchiveVotesFile, 'utf-8'))
    : {}

  return { citizenSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes }
}
module.exports = {
  exportsDirNation,
  citizenSpecificVotesFile,
  proposalVotesFile,
  proposalVotersFile,
  proposalArchiveVotesFile,
  writeFile,
  voteDataRollupsFile,
}
