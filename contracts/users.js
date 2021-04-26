const { getUserContract } = require('../utils/contract')

const getUser = async (address, userContract = null) => {
  if (!userContract) {
    userContract = await getUserContract()
  }
  try {
    const user = await userContract.callSmartContractGetFunc('getUser', [address])
    const userJSON = JSON.parse(user)
    return {
      success: true,
      name: userJSON["fullName"],
      country: userJSON["country"],
      linkedin: userJSON["linkedinUrl"]
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/* get all user ids*/
const listUserIds = async (contract = null) => {
  if (contract === null) {
    contract = getUserContract()
  }
  let cursor = 0;
  let howMany = 1000; // Get thousands at a time
  let allIds = []
  try {
    do {
      let userIds = await contract.callSmartContractGetFunc('getUserIdsByCursor', [cursor, howMany])
      allIds = allIds.concat(userIds)
      cursor = cursor + howMany
    } while (1)
  }
  catch (e) {
    console.log(e.message)
  }
  return allIds
}

module.exports = {
  getUser,
  listUserIds
}