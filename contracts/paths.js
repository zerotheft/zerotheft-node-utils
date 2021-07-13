const fs = require('fs')
const PromisePool = require('@supercharge/promise-pool')
const dir = require('path')
const splitFile = require('split-file');
const yaml = require('js-yaml')
const { getPathContract, getProposalContract, getVoteContract } = require('../utils/contract')
const { convertStringToHash } = require('../utils/web3')
const { updateUmbrellaPaths } = require('../utils/storage');
const { getCitizen } = require('./citizens')
const { APP_PATH } = require('../config')
const { contractIdentifier: proposalIdentifier, getProposalContractVersion, getProposalDetails } = require('./proposals')
const homedir = APP_PATH || require('os').homedir()

const pathYamlDir = dir.join(homedir, '.zt', '/pathYamls')
if (!fs.existsSync(pathYamlDir)) {
  fs.mkdirSync(pathYamlDir, { recursive: true });
}

const fetchPathYaml = async (contract, yamlBlockHash, index, allOutputs = []) => {
  const yamlBlock = await contract.callSmartContractGetFunc('getEconomicHierarchyYamlBlock', [yamlBlockHash], 900000)
  const outpuFileName = `${pathYamlDir}/output-${index}`;
  fs.writeFileSync(outpuFileName, yamlBlock.content, 'utf-8');

  allOutputs.push(outpuFileName)

  if (yamlBlock.nextYamlBlock !== "") {
    await fetchPathYaml(yamlBlock.nextYamlBlock, index + 1, allOutputs)
  }
  return allOutputs
}

const allNations = async () => {
  const contract = getPathContract()
  const nations = ['USA']
  return Promise.all(nations.map(async nation => {
    //fetch path yaml chunks based on nation hash
    const path = await contract.callSmartContractGetFunc('getLatestEconomicHierarchy', [])
    const pathDir = `${pathYamlDir}/${nation}-hierarchy-v${path.version}.yaml`;
    if (!fs.existsSync(pathDir) && Object.keys(path).length > 0) {
      const hierarchyYaml = await contract.callSmartContractGetFunc('getEconomicHierarchyYaml', [path.yamlOfEconomicHierarchy], 900000)
      outputFiles = await fetchPathYaml(contract, hierarchyYaml.firstBlock, 1)
      await splitFile.mergeFiles(outputFiles, pathDir)
    }
    pathYamlContent = yaml.safeLoad(fs.readFileSync(pathDir, 'utf8'))

    return {
      pathRoot: path.pathRoot,
      nation,
      hierarchy: pathYamlContent,
      version: path.version,
      pathCrumbs: makePathCrumbs(pathYamlContent)
    }
  }))
}

const makePathCrumbs = (path = pathYamlContent, allPaths = [], paths = []) => {
  Object.keys(path).map((key) => {
    if (['Alias', 'umbrella', 'leaf', 'parent', 'display_name', 'Version'].includes(key)) return
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
  const path = await contract.callSmartContractGetFunc('getLatestEconomicHierarchy', [])
  const pathDir = `${pathYamlDir}/${nation}-hierarchy-v${path.version}.yaml`;
  if (!fs.existsSync(pathDir) && Object.keys(path).length > 0) {
    const hierarchyYaml = await contract.callSmartContractGetFunc('getEconomicHierarchyYaml', [path.yamlOfEconomicHierarchy], 900000)
    outputFiles = await fetchPathYaml(contract, hierarchyYaml.firstBlock, 1)
    await splitFile.mergeFiles(outputFiles, pathDir)
  }
  pathYamlContent = yaml.safeLoad(fs.readFileSync(pathDir, 'utf8'))
  return pathYamlContent
}
/**
 * Get Umbrella nodes from cache or from blockchain
 */
const getUmbrellaPaths = async (nation = 'USA') => {
  try {
    const pathData = await pathsByNation(nation)
    const paths = pathData[nation]
    let umbrellas = {}
    const traversePath = async (pathNode, path = '') => {
      for (let enode of Object.keys(pathNode)) {
        if (enode === "metadata" && pathNode[enode]['umbrella']) {
          umbrellas[path.toString()] = {
            "value_parent": pathNode[enode]["value_parent"]
          }
        }
        let newPath = path ? `${path}/${enode}` : enode
        if (['display_name', 'leaf', 'umbrella', 'parent', 'metadata'].includes(enode)) {
          continue
        }
        traversePath(pathNode[enode], newPath)
      }
      return umbrellas
    }
    traversePath(paths)

    updateUmbrellaPaths({ paths: umbrellas })

    return umbrellas
  } catch (e) {
    throw new Error(`getUmbrellaPaths:: ${e.message}`)
  }
}
/*
* Return all the information of path including proposals and votes
*/
const getPathDetail = async (path, proposalContract = null, voterContract = null, withInfo) => {
  let allVotesInfo = []
  try {
    if (!proposalContract) {
      proposalContract = getProposalContract()
    }
    if (!voterContract) {
      voterContract = getVoteContract()
    }
    let count = 0;
    const propVer = await getProposalContractVersion()
    let { propIds } = await proposalContract.callSmartContractGetFunc('allProposalsByPath', [convertStringToHash(path)])
    if (propIds.length === 0) throw new Error(`no proposals found for ${path}`)
    let { results: pathDetails, errors } = await PromisePool
      .withConcurrency(10)
      .for(propIds)
      .process(async id => {
        id = `${proposalIdentifier}:${propVer.version}:${id}`
        count++;
        let proposal
        try {
          proposal = await getProposalDetails(id, proposalContract)
        }
        catch (e) {
          console.log('getPathDetail Error::', id, e)
          return null
        }

        //get rid of un-necessary  keys
        ['detail', 'ratings', 'complaints', 'description', 'proposal_hash'].forEach(e => delete proposal[e]);
        if (!withInfo) {
          // pathDetails.push(proposal)
          return proposal
        }
        let { results: voteInfo, errors } = await PromisePool
          .withConcurrency(10)
          .for(proposal.votes)
          .process(async vid => {
            try {
              let singleVoterInfo = await voterContract.callSmartContractGetFunc('getVote', [vid])
              // let citizenInfo = await getCitizen(singleVoterInfo.voter)
              return {
                voterId: singleVoterInfo.voter,
                voteId: vid,
                voteType: singleVoterInfo.voteIsTheft,
                altTheftAmt: singleVoterInfo.customTheftAmount === "" ? {} : JSON.parse(singleVoterInfo.customTheftAmount),
                path: path.split('/').slice(1).join('/'),
                proposalId: id,
                votedYears: Object.keys(proposal.theftYears).map(y => parseInt(y))
              }
            }
            catch (e) {
              console.log('getPathDetail(getVote)', e)
              return null
            }
          })
        allVotesInfo = allVotesInfo.concat(voteInfo)
        console.log(`Proposal: ${path} ::  ${id} detail fetched`)

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
  getUmbrellaPaths
}
