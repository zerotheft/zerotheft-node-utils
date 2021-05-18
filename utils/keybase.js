const exec = require('child_process').exec
const { fetch } = require('./api')

const getCurrentUser = async (cb) => {
  return new Promise((resolve, reject) => {
    let user
    exec('keybase whoami', (err, stdout, stderr) => {
      if (err || stderr || !stdout) {
        reject()
        return
      }
      user = Buffer.from(stdout).toString('utf8').replace(/(\r\n|\n|\r)/gm, '')
      resolve(user)
    })
  })
}

const areKeysSet = () => {
  return new Promise((resolve, reject) => {
    exec('keybase pgp list', (err, stdout, stderr) => {
      if (err || stderr || !stdout) {
        reject()
      }
      resolve()
    })
  })
}

const isLoggedIntoKeybase = async user => {
  const currentUser = await getCurrentUser()
  return user === currentUser
}

const hasProofInGithub = async keybaseUser => {
  try {
    const userName = keybaseUser || await getCurrentUser()

    const user = await fetchUserFromKeybase(userName)
    const proofs = user.proofs_summary.all
    const githubProof = proofs.find(i => i.proof_type === 'github')
    if(githubProof) {
      console.log('is verified', true)
      return true
    }
    console.log('not verified')
    return false
  } catch(e) {
    return false
  }
}

const fetchUserFromKeybase = async user => {
  try {
    const data = await fetch(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${user}`)
    return data.them[0]
  }catch(e) {
    return {}
  }
}

module.exports = {
  getCurrentUser,
  areKeysSet,
  isLoggedIntoKeybase,
  hasProofInGithub
}
