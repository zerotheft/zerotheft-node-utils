const fs = require('fs')
const { APP_PATH } = require('../config')
const exportsDirNation = `${APP_PATH}/public/exports/nation_data`
const userSpecificVotesFile = `${exportsDirNation}/user_specific_votes.json`
const proposalVotesFile = `${exportsDirNation}/proposalVotes.json`
const proposalVotersFile = `${exportsDirNation}/proposalVoters.json`
const proposalArchiveVotesFile = `${exportsDirNation}/proposalArchiveVotes.json`


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
//returns voting rollups information
const voteDataRollupsFile = async () => {

  let userSpecificVotes = fs.existsSync(userSpecificVotesFile) ? JSON.parse(fs.readFileSync(userSpecificVotesFile, 'utf-8')) : {}
  let proposalVotes = fs.existsSync(proposalVotesFile) ? JSON.parse(fs.readFileSync(proposalVotesFile, 'utf-8')) : {}
  let proposalVoters = fs.existsSync(proposalVotersFile) ? JSON.parse(fs.readFileSync(proposalVotersFile, 'utf-8')) : {}
  let proposalArchiveVotes = fs.existsSync(proposalArchiveVotesFile) ? JSON.parse(fs.readFileSync(proposalArchiveVotesFile, 'utf-8')) : {}

  return { userSpecificVotes, proposalVotes, proposalVoters, proposalArchiveVotes }
}
module.exports = {
  exportsDirNation,
  userSpecificVotesFile,
  proposalVotesFile,
  proposalVotersFile,
  proposalArchiveVotesFile,
  writeFile,
  voteDataRollupsFile
}