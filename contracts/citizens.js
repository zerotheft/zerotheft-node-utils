const { getCitizenContract } = require('../utils/contract')

const getCitizen = async (address, citizenContract = null) => {
  if (!citizenContract) {
    citizenContract = await getCitizenContract()
  }
  try {
    const citizen = await citizenContract.callSmartContractGetFunc('getCitizen', [address])
    const citizenExtra = await citizenContract.callSmartContractGetFunc('getCitienExtraData', [address])
    return {
      success: true,
      name: `${citizen.firstName} ${citizen.middleName} ${citizen.lastName}`,
      firstName: citizen.firstName,
      middleName: citizen.middleName,
      lastName: citizen.lastName,
      country: citizenExtra.country,
      citizenship: citizenExtra.citizenship,
      currentState: citizenExtra.currentState,
      currentCity: citizenExtra.currentCity,
      currentZip: citizenExtra.currentZip,
      version: citizenExtra.version,
      linkedin: citizen.linkedin,
      createdAt: citizenExtra.citizenCreatedDate,
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
      let citizenIds = await contract.callSmartContractGetFunc('getCitizenIdsByCursor', [cursor, howMany])
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
  getCitizen,
  listCitizenIds
}