const fs = require('fs')
const PromisePool = require('@supercharge/promise-pool')
const dir = require('path')
const splitFile = require('split-file')
const yaml = require('js-yaml')
const { getPathContract, getProposalContract, getVoteContract } = require('../utils/contract')
const { convertStringToHash } = require('../utils/web3')
const { updateUmbrellaPaths } = require('../utils/storage')
const { APP_PATH } = require('../config')
// eslint-disable-next-line import/order
const homedir = APP_PATH || require('os').homedir()
const {
  contractIdentifier: proposalIdentifier,
  getProposalContractVersion,
  getProposalDetails,
} = require('./proposals')

const pathYamlDir = dir.join(homedir, '.zt', '/pathYamls')
if (!fs.existsSync(pathYamlDir)) {
  fs.mkdirSync(pathYamlDir, { recursive: true })
}

const fetchPathYaml = async (contract, yamlBlockHash, index, allOutputs = []) => {
  const yamlBlock = await contract.callSmartContractGetFunc('getEconomicHierarchyYamlBlock', [yamlBlockHash], 900000)
  const outpuFileName = `${pathYamlDir}/output-${index}`
  fs.writeFileSync(outpuFileName, yamlBlock.content, 'utf-8')

  allOutputs.push(outpuFileName)

  if (yamlBlock.nextYamlBlock !== '') {
    await fetchPathYaml(yamlBlock.nextYamlBlock, index + 1, allOutputs)
  }
  return allOutputs
}
/**
 * Prepare a path crumbs based on the path yaml content.
 * @param {Object} path - Content of a path yaml file.
 * @param {array} allPaths - Array containing the url of path from economic hierarchy file.
 * @param {array} paths - Array containing the items of a economic hierarchy file.
 * @return {array} Returning the full url of all paths from economic hierarchy file.
 */
const makePathCrumbs = (path = pathYamlContent, allPaths = [], paths = []) => {
  // eslint-disable-next-line array-callback-return
  Object.keys(path).map(key => {
    if (['Alias', 'umbrella', 'leaf', 'parent', 'display_name', 'Version'].includes(key)) return
    Object.keys(path).forEach(item => {
      if (paths.indexOf(item) > 0) {
        paths.length = paths.indexOf(item)
      }
    })
    paths.push(key)
    if (key === '0' || typeof path === 'string') {
    } else if (path[key] && path.hasOwnProperty(key) && !path[key].leaf) {
      if (typeof path[key] !== 'string') {
        makePathCrumbs(path[key], allPaths, paths)
      }
    } else {
      allPaths.push(paths.join('/'))
    }
  })
  return allPaths
}

/**
 * Get the economic hierarchy data from all nations.
 * @return {array} Array of json objects that holds the economic hierarchy data from all nations.
 */
const allNations = async () => {
  const contract = getPathContract()
  const nations = ['USA']
  return Promise.all(
    nations.map(async nation => {
      // fetch path yaml chunks based on nation hash
      const hierarchyAreaBytes = convertStringToHash('RiggedEconomy')
      const path = await contract.callSmartContractGetFunc('getLatestEconomicHierarchy', [hierarchyAreaBytes])
      const pathDir = `${pathYamlDir}/${nation}-hierarchy-v${path.version}.yaml`
      if (!fs.existsSync(pathDir) && Object.keys(path).length > 0) {
        const hierarchyYaml = await contract.callSmartContractGetFunc(
          'getEconomicHierarchyYaml',
          [path.yamlOfEconomicHierarchy],
          900000
        )
        const outputFiles = await fetchPathYaml(contract, hierarchyYaml.firstBlock, 1)
        await splitFile.mergeFiles(outputFiles, pathDir)
      }
      const pathYamlContent = yaml.safeLoad(fs.readFileSync(pathDir, 'utf8'))

      return {
        pathRoot: path.pathRoot,
        nation,
        hierarchy: pathYamlContent,
        version: path.version,
        pathCrumbs: makePathCrumbs(pathYamlContent),
      }
    })
  )
}

/**
 * Return paths based on nation.
 * @param {string} nation - Name of the nation whose path is required.
 * @param {string} area - Search for the path based on area.
 * @return {Object} JSON object of the path.
 */
const pathsByNation = async (nation = 'USA', area = 'RiggedEconomy') => {
  const contract = getPathContract()
  const hierarchyAreaBytes = convertStringToHash(area)
  const path = await contract.callSmartContractGetFunc('getLatestEconomicHierarchy', [hierarchyAreaBytes])
  const pathDir = `${pathYamlDir}/${nation}-hierarchy-v${path.version}.yaml`
  if (!fs.existsSync(pathDir) && Object.keys(path).length > 0) {
    const hierarchyYaml = await contract.callSmartContractGetFunc(
      'getEconomicHierarchyYaml',
      [path.yamlOfEconomicHierarchy],
      900000
    )
    const outputFiles = await fetchPathYaml(contract, hierarchyYaml.firstBlock, 1)
    await splitFile.mergeFiles(outputFiles, pathDir)
  }
  const pathYamlContent = yaml.safeLoad(fs.readFileSync(pathDir, 'utf8'))
  return pathYamlContent
}
/**
 * Get Umbrella nodes from cache or from blockchain.
 * @param {string} nation - Name of the nation which umbrella path is needed.
 */
const getUmbrellaPaths = async (nation = 'USA') => {
  try {
    const pathData = await pathsByNation(nation)
    const paths = pathData[nation]
    const umbrellas = {}
    const traversePath = async (pathNode, path = '') => {
      for (const enode of Object.keys(pathNode)) {
        if (enode === 'metadata' && pathNode[enode].umbrella) {
          umbrellas[path.toString()] = {
            value_parent: pathNode[enode].value_parent,
          }
        }
        const newPath = path ? `${path}/${enode}` : enode
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
    let allDetails = []
    let count = 0
    const verRes = await getProposalContractVersion(proposalContract)
    while (verRes.number > 0) {
      const { propIds } = await proposalContract.callSmartContractGetFunc('allProposalsByPath', [
        convertStringToHash(path),
        verRes.number,
      ])
      if (propIds.length === 0) throw new Error(`no proposals found for ${path}`)
      const { results: pathDetails } = await PromisePool.withConcurrency(10)
        .for(propIds)
        .process(async id => {
          id = `${proposalIdentifier}:v${verRes.number}:${id}`
          count++
          let proposal
          try {
            proposal = await getProposalDetails(id, proposalContract)
          } catch (e) {
            console.log('getPathDetail Error::', id, e)
            return null
          }

          // get rid of un-necessary  keys
          ;['detail', 'ratings', 'complaints', 'description', 'proposal_hash'].forEach(e => delete proposal[e])
          if (!withInfo) {
            return proposal
          }

          const { results: voteInfo } = await PromisePool.withConcurrency(10)
            .for(proposal.votes)
            .process(async vid => {
              try {
                const singleVoterInfo = await voterContract.callSmartContractGetFunc('getVote', [vid])
                // let citizenInfo = await getCitizen(singleVoterInfo.voter)
                return {
                  voterId: singleVoterInfo.voter,
                  voteId: vid,
                  voteType: singleVoterInfo.voteIsTheft === 'True',
                  altTheftAmt:
                    singleVoterInfo.customTheftAmount === '' ? {} : JSON.parse(singleVoterInfo.customTheftAmount),
                  path: path.split('/').slice(1).join('/'),
                  proposalId: id,
                  votedYears: Object.keys(proposal.theftYears).map(y => parseInt(y)),
                }
              } catch (e) {
                console.log('getPathDetail(getVote)', e)
                return null
              }
            })
          allVotesInfo = allVotesInfo.concat(voteInfo)
          console.log(`Proposal: ${path} ::  ${id} detail fetched`)

          return {
            ...proposal,
            path: path.split('/').slice(1).join('/'),
            voteInfo,
          }
        })

      allDetails = allDetails.concat(pathDetails)
      verRes.number--
    }
    return { allDetails, allVotesInfo, success: true }
  } catch (e) {
    return { success: false, message: e.message }
  }
}

module.exports = {
  allNations,
  getPathDetail,
  pathsByNation,
  getUmbrellaPaths,
}
