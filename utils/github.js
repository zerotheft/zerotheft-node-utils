const axios = require('axios')
const { last, template } = require('lodash')

const getGithubTemplate = async path => {
  // const { data, status } = await callGithub(`https://api.github.com/repos/zerotheft/template_problem_hierarchy/contents/${path}`)

  // if (status === 200 && data.length > 0) {
  //   const toGet = data.find(i => i.name === `${proposalTemplate}.yaml`)
  //   if (!toGet) return
  const proposalTemplate = last(path.split('/'))

  const templateUrl = `https://raw.githubusercontent.com/zerotheft/template_problem_hierarchy_yamls/master/${path}/${proposalTemplate}.yaml`
  const { data: proposalData, status: proposalStatus } = await callGithub(templateUrl)
  if (proposalStatus === 200) {
    return proposalData
  }
}

// const getUmbrellas = async () => {
//   try {
//     const { data } = await callGithub(`https://api.github.com/repos/zerotheft/template_problem_hierarchy/git/trees/master`)
//     const proposal = data.tree.find(i => i.path === 'proposals')
//     const paths = getStoragePaths()
//     console.log(proposal, paths)

//     if (paths && paths.sha === proposal.sha) {
//       return paths.paths
//     }
//     let umbrellas = []

//     const traverse = async (item, path = '') => {
//       const { data: { tree } } = await callGithub(item.url)
//       await Promise.all(tree.map(async branch => {

//         if (branch.path === `${item.path}.yaml`) {
//           const hasOtherTrees = tree.find(i => i.type === 'tree')

//           if (hasOtherTrees) umbrellas.push(path)
//         }

//         if (branch.type === 'tree') {
//           let newPath = path + (path ? '/' : '') + branch.path

//           await traverse(branch, newPath)
//         }
//       })
//       )
//     }

//     await traverse(proposal)

//     updateUmbrellaPaths({ sha: proposal.sha, paths: umbrellas })

//     return umbrellas
//   } catch (e) {
//     throw new Error('Cannot fetch from github.')
//   }
// }

const callGithub = async api => {
  const { data, status } = await axios(api, {
    method: 'get',
    // headers: {
    //   "Authorization": `token ${GIT_TOKEN}`
    // }
  })

  return { data, status }
}

module.exports = {
  getGithubTemplate,
}
