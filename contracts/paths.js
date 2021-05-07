const fs = require('fs')
const PromisePool = require('@supercharge/promise-pool')
const dir = require('path')
const splitFile = require('split-file');
const yaml = require('js-yaml')
const { getPathContract, getProposalContract, getVoterContract } = require('../utils/contract')
const { convertStringToHash } = require('../utils/web3')
const { getUser } = require('./users')
const { APP_PATH } = require('../config')
const { getProposalDetails } = require('./proposals')
const homedir = APP_PATH || require('os').homedir()

const pathYamlDir = dir.join(homedir, '.zt', '/pathYamls')
if (!fs.existsSync(pathYamlDir)) {
  fs.mkdirSync(pathYamlDir, { recursive: true });
}

const fetchPathYaml = async (contract, yamlBlockHash, index, allOutputs = []) => {
  const yamlBlock = await contract.callSmartContractGetFunc('getPathYaml', [yamlBlockHash], 900000)
  const outpuFileName = `${pathYamlDir}/output-${index}`;
  fs.writeFileSync(outpuFileName, yamlBlock.content, 'utf-8');

  allOutputs.push(outpuFileName)

  if (!yamlBlock[4]) {
    await fetchPathYaml(yamlBlock[1], index + 1, allOutputs)
  }
  return allOutputs
}

const allNations = async () => {
  const contract = getPathContract()
  const nationHashes = await contract.callSmartContractGetFunc('allNations')

  return Promise.all(nationHashes.map(async hash => {
    //fetch path yaml chunks based on nation hash
    const path = await contract.callSmartContractGetFunc('getPath', [hash])
    const pathDir = `${pathYamlDir}/${path.nation}-hierarchy-v${path.version}.yaml`;
    if (!fs.existsSync(pathDir) && Object.keys(path).length > 0) {
      outputFiles = await fetchPathYaml(contract, path.yamlBlock, 1)
      await splitFile.mergeFiles(outputFiles, pathDir)
    }
    pathYamlContent = yaml.safeLoad(fs.readFileSync(pathDir, 'utf8'))

    return {
      pathRoot: path.pathRoot,
      nation: path.nation,
      hierarchy: pathYamlContent,
      version: path.version,
      pathCrumbs: makePathCrumbs(pathYamlContent)
    }
  }))
}

const makePathCrumbs = (path = pathYamlContent, allPaths = [], paths = []) => {
  Object.keys(path).map((key) => {
    if (['Alias', 'umbrella', 'leaf', 'parent', 'display_name'].includes(key)) return
    Object.keys(path).forEach((item) => {
      if (paths.indexOf(item) > 0)
        paths.length = paths.indexOf(item)
    })
    paths.push(key)
    if (key === "0" || typeof (path) == "string") {
      return
    }
    else if (path[key] && path.hasOwnProperty(key) && !path[key].leaf) {
      if (typeof (path[key]) !== 'string')
        makePathCrumbs(path[key], allPaths, paths)
    } else {
      allPaths.push(paths.join('/'))
    }
  })
  return allPaths
}

/*
* Return paths based on nation
*/
const pathsByNation = async (nation = 'USA') => {
  const contract = getPathContract()
  const path = await contract.callSmartContractGetFunc('getPath', [convertStringToHash(nation)])
  const pathDir = `${pathYamlDir}/${path.nation}-hierarchy-v${path.version}.yaml`;
  if (Object.keys(path).length > 0) {
    outputFiles = await fetchPathYaml(contract, path.yamlBlock, 1)
    await splitFile.mergeFiles(outputFiles, pathDir)
  }
  pathYamlContent = yaml.safeLoad(fs.readFileSync(pathDir, 'utf8'))
  return pathYamlContent
}

/*
* Return all the information of path including proposals and votes
*/
const getPathDetail = async (path, year, proposalContract = null, voterContract = null, withInfo) => {
  let allVotesInfo = []
  try {
    if (!proposalContract) {
      proposalContract = getProposalContract()
    }
    if (!voterContract) {
      voterContract = getVoterContract()
    }
    const proposalIds = await proposalContract.callSmartContractGetFunc('proposalsPerPathYear', [convertStringToHash(path), year])
    if (proposalIds.length === 0) throw new Error(`no proposals found for ${path} - ${year}`)
    let { results: pathDetails, errors } = await PromisePool
      .withConcurrency(10)
      .for(proposalIds)
      .process(async id => {
        let proposal
        try {
          proposal = await getProposalDetails(id, proposalContract, voterContract)
        }
        catch (e) {
          console.log('getPathDetail Error::', id, e)
          return null
        }

        if (!withInfo) {
          // pathDetails.push(proposal)
          return proposal
        }

        let { results: voteInfo, errors } = await PromisePool
          .withConcurrency(10)
          .for(proposal.votes)
          .process(async vid => {
            try {
              let singleVoterInfo = await voterContract.callSmartContractGetFunc('getVotes', [parseInt(vid)])
              let userInfo = await getUser(singleVoterInfo.voter)
              return {
                voterId: singleVoterInfo.voter,
                voteId: vid,
                ...userInfo,
                voteType: singleVoterInfo.voteType,
                altTheftAmt: singleVoterInfo.altTheftAmt,
                comment: singleVoterInfo.comment,
                votedDate: new Date(singleVoterInfo.date * 1000),
                path: path.split('/').slice(1).join('/'),
                proposalId: id,
                year: proposal.year
              }
            }
            catch (e) {
              console.log('getPathDetail(getVotes)', e)
              return null
            }
          })
        allVotesInfo = allVotesInfo.concat(voteInfo)
        console.log(`Proposal ${id} detail fetched(year ${year})`)

        return {
          ...proposal,
          path: path.split('/').slice(1).join('/'),
          voteInfo
        }
      })
    return { pathDetails, allVotesInfo, success: true }
  } catch (e) {
    return { success: false, message: e.message }
  }
}

module.exports = {
  allNations,
  getPathDetail,
  pathsByNation,

}
