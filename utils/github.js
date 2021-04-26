const axios = require('axios');
const { last } = require('lodash')
const { GIT_TOKEN } = require('../config')
const { getUmbrellaPaths: getStoragePaths, updateUmbrellaPaths } = require('./storage');

const getProposalTemplate = async (path) => {
  const { data, status } = await callGithub(`https://api.github.com/repos/zerotheft/template_problem_hierarchy/contents/${path}`)

  if (status === 200 && data.length > 0) {
    const proposalTemplate = last(path.split('/'))
    const toGet = data.find(i => i.name === `${proposalTemplate}.yaml`)
    if (!toGet) return

    const { data: proposalData, status: proposalStatus } = await callGithub(toGet.download_url)
    if (proposalStatus === 200) {
      return proposalData
    }
  }

  return
}

const getUmbrellaPaths = async () => {
  try {
    const { data } = await callGithub(`https://api.github.com/repos/zerotheft/template_problem_hierarchy/git/trees/master`)
    const proposal = data.tree.find(i => i.path === 'proposals')
    const paths = getStoragePaths()

    if (paths && paths.sha === proposal.sha) {
      return paths.paths
    }
    let umbrellas = []

    const traverse = async (item, path = '') => {
      const { data: { tree } } = await callGithub(item.url)
      await Promise.all(tree.map(async branch => {


        if (branch.path === `${item.path}.yaml`) {
          const hasOtherTrees = tree.find(i => i.type === 'tree')

          if (hasOtherTrees) umbrellas.push(path)
        }

        if (branch.type === 'tree') {
          let newPath = path + (path ? '/' : '') + branch.path

          await traverse(branch, newPath)
        }
      })
      )
    }

    await traverse(proposal)

    updateUmbrellaPaths({ sha: proposal.sha, paths: umbrellas })

    return umbrellas
  } catch (e) {
    throw new Error('Cannot fetch from github.')
  }
}

const callGithub = async (api) => {
  const { data, status } = await axios(api, {
    method: 'get',
    headers: {
      "Authorization": `token ${GIT_TOKEN}`
    }
  })

  return { data, status }
}

module.exports = {
  getUmbrellaPaths,
  getProposalTemplate
}