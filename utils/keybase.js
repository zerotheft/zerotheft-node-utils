const exec = require('child_process').exec
const { fetch } = require('./api')

const getCurrentCitizen = async (cb) => {
  return new Promise((resolve, reject) => {
    let citizen
    exec('keybase whoami', (err, stdout, stderr) => {
      if (err || stderr || !stdout) {
        reject()
        return
      }
      citizen = Buffer.from(stdout).toString('utf8').replace(/(\r\n|\n|\r)/gm, '')
      resolve(citizen)
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

const isLoggedIntoKeybase = async citizen => {
  const currentCitizen = await getCurrentCitizen()
  return citizen === currentCitizen
}

const hasProofInGithub = async keybaseCitizen => {
  try {
    const citizenName = keybaseCitizen || await getCurrentCitizen()

    const citizen = await fetchCitizenFromKeybase(citizenName)
    const proofs = citizen.proofs_summary.all
    const githubProof = proofs.find(i => i.proof_type === 'github')
    if (githubProof) {
      console.log('is verified', true)
      return true
    }
    console.log('not verified')
    return false
  } catch (e) {
    return false
  }
}

const fetchCitizenFromKeybase = async citizen => {
  try {
    const data = await fetch(`https://keybase.io/_/api/1.0/citizen/lookup.json?citizennames=${citizen}`)
    return data.them[0]
  } catch (e) {
    return {}
  }
}

module.exports = {
  getCurrentCitizen,
  areKeysSet,
  isLoggedIntoKeybase,
  hasProofInGithub
}
