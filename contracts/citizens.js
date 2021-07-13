const { getCitizenContract } = require('../utils/contract')

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
    const contractIdentifier = "ZTMCitizen"
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
  let cursor = 0;
  let howMany = 1000; // Get thousands at a time
  let allIds = []
  try {
    do {
      let citizenIds = await contract.callSmartContractGetFunc('getCitizenIndicesByCursor', [cursor, howMany])
      allIds = allIds.concat(citizenIds)
      cursor = cursor + howMany
    } while (1)
  }
  catch (e) {
    console.log(e.message)
  }
  return allIds
}

module.exports = {
  getCitizenIdByAddress,
  getCitizen,
  listCitizenIds
}