const { getCitizenContract } = require('../utils/contract')
const contractIdentifier = "ZTMCitizen"

/**
 * Fetch the respective index of citizen address
 * @param {string} citizenAddress address of a citizen
 * @param {Object} citizenContract object of a citizen contract
 * @returns 
 */
const getCitizenIdByAddress = async (citizenAddress, citizenContract = null) => {
  if (!citizenContract) {
    citizenContract = await getCitizenContract()
  }
  try {
    const citizenIndex = await citizenContract.callSmartContractGetFunc('getUnverifiedCitizenAddressIndex', [citizenAddress])
    if (parseInt(citizenIndex) === 0) throw new Error("no citizen available with respect to address")
    const contractVersion = await citizenContract.callSmartContractGetFunc('getContractVersion',)

    return {
      success: true,
      citizenIndex,
      citizenID: `${contractIdentifier}:${contractVersion}:${citizenIndex}`
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Get the version of citizen contract version
 * @param {object} citizenContract Instance of citizen contract
 * @returns Object with citizen contract version information
 */
const getCitizenContractVersion = async (citizenContract = null) => {
  if (!citizenContract) {
    citizenContract = await getCitizenContract()
  }
  try {
    const version = await citizenContract.callSmartContractGetFunc('getContractVersion')
    return {
      success: true,
      version
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
const getCitizen = async (citizenID, citizenContract = null) => {
  if (!citizenContract) {
    citizenContract = await getCitizenContract()
  }
  try {
    const citizen = await citizenContract.callSmartContractGetFunc('getUnverifiedCitizen', [citizenID])
    const citizenExtra = await citizenContract.callSmartContractGetFunc('getUnverifiedCitienExtraData', [citizenID])

    return {
      success: true,
      name: `${citizen.firstName} ${citizen.middleName} ${citizen.lastName}`,
      address: citizen.citizenAddress,
      firstName: citizen.firstName,
      middleName: citizen.middleName,
      lastName: citizen.lastName,
      country: citizenExtra.country,
      citizenship: citizen.citizenship,
      currentState: citizenExtra.currentState,
      currentCity: citizenExtra.currentCity,
      currentZip: citizenExtra.currentZip,
      version: citizenExtra.version,
      linkedin: citizen.linkedin,
      createdAt: citizenExtra.createdAt,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/* get all citizen ids*/
const listCitizenIds = async (contract = null) => {
  if (contract === null) {
    contract = getCitizenContract()
  }
  const latestVersion = await contract.callSmartContractGetFunc('getContractVersion');
  let version = latestVersion.split('v')[1];
  let allVoters = {}
  let allVotersCount = 0;
  while (version > 0) {
    let versionVoters = [];
    let cursor = 0;
    let howMany = 1000;
    try {
      do {
        let voters = await contract.callSmartContractGetFunc('getUnverifiedCitizenIndicesByCursor', [cursor, howMany, version])
        versionVoters = versionVoters.concat(voters)
        cursor = cursor + howMany
      } while (1)
    }
    catch (e) {
      console.log(e.message)
    }
    allVoters[`v${version}`] = versionVoters
    allVotersCount += versionVoters.length
    version--;
  }
  return { allVoters, allVotersCount }
}

module.exports = {
  contractIdentifier,
  getCitizenContractVersion,
  getCitizenIdByAddress,
  getCitizen,
  listCitizenIds
}