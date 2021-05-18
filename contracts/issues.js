const { getPathContract, getProposalContract } = require('../utils/contract')
const { callSmartContractGetFunc, convertStringToHash } = require('../utils/web3')
const { getProposals } = require('./proposals')

/*
* Return Issues based on path
*/
const getPathIssues = async (path, detailMode = false) => {
  const contract = getPathContract()
  const issuesFromPath = await contract.callSmartContractGetFunc('getPath', [convertStringToHash(path)])
  const issues = await getIssues(issuesFromPath[2], detailMode)
  return issues
}

/*
* Return issue details based on issue IDs
*/
const getIssues = async (issueIDs, detailMode = false, iContract, pContract) => {
  const proposalContract = pContract || getProposalContract()
  await issueContract.init()
  await proposalContract.init()
  const promises = issueIDs.map(async (issueID) => {
    const issueDetail = await issueContract.callSmartContractGetFunc('getIssue', [parseInt(issueID)])
    const proposals = issueDetail[2]
    const altProposals = issueDetail[3]
    issueReport = `zt_issue_report_${issueID}`
    const issueData = {
      "id": issueID,
      "owner": issueDetail[0],
      "title": issueDetail[1],
      "total_proposals": proposals.length,
      "total_counter_proposals": altProposals.length,
      "created_at": issueDetail[4]
    }
    if (detailMode) {
      //If issue has proposals
      if (proposals.length > 0) {
        issueData["proposals"] = await getProposals(proposals, proposalContract)
      }
      //If issue has alternate proposals
      if (altProposals.length > 0) {
        issueData["counter_proposals"] = await getProposals(altProposals, proposalContract)
      }
    }
    return issueData
  })
  const issues = await Promise.all(promises)
  return issues
}

module.exports = {
  getPathIssues,
  getIssues,
}
