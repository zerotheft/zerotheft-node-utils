const { getCitizenContract } = require('../utils/contract')

const getCitizen = async (address, citizenContract = null) => {
  if (!citizenContract) {
    citizenContract = await getCitizenContract()
  }
  try {
    const citizen = await citizenContract.callSmartContractGetFunc('getCitizen', [address])
    const citizenJSON = JSON.parse(citizen.details)
    return {
      success: true,
      name: citizenJSON["fullName"],
      country: citizenJSON["country"],
      linkedin: citizenJSON["linkedinUrl"]
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