const { addHolonDonor } = require('./holons')
const { getWalletContract } = require('../utils/contract')

/* get wallet information based on citizen address */
const getWallet = async (citizen, walletContract) => {
  try {
    const walletInfo = await walletContract.callSmartContractGetFunc('getWallet', [citizen]);

    return { success: true, walletInfo }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

const createWallet = async (balance, holonAddress, walletContract = null) => {
  try {
    if (!walletContract) {
      walletContract = getWalletContract()
      walletContract.init()
    }
    await walletContract.createTransaction('createWallet', [balance, holonAddress])
    // add citizen in holon donor list
    await addHolonDonor(holonAddress)

    return { success: true, message: 'wallet created successfully' };
  } catch (e) {
    console.log(e)
    return { success: false, error: e.message }
  }
}

const walletRecord = async (citizen, balance, holonAddress, walletContract = null) => {
  try {
    if (!walletContract) {
      walletContract = getWalletContract()
      walletContract.init()
    }
    const wallet = await getWallet(citizen, walletContract)
    if (!wallet.success) {
      await walletContract.createTransaction('createWallet', [balance.toString(), holonAddress])
    } else {
      const newBalance = parseFloat(wallet.walletInfo.balance) + parseFloat(balance)
      await walletContract.createTransaction('updateWallet', [newBalance.toString(), holonAddress, citizen])
      await walletContract.createTransaction('addActivity', [balance.toString(), 'credit', holonAddress, citizen])
    }
    // add citizen in holon donor list
    await addHolonDonor(holonAddress)

    return { success: true, message: 'wallet created successfully' };
  } catch (e) {
    console.log(e)
    return { success: false, error: e.message }
  }
}


/* get wallet information based on citizen address */
const walletActivities = async (citizen, wallet, walletContract) => {
  try {
    const transactionsCount = wallet.transactionsCount
    const activities = []
    for (let i = 1; i <= transactionsCount; i++) {
      const activity = await walletContract.callSmartContractGetFunc('getActivities', [citizen, i]);
      activities.push(activity)
    }
    return { success: true, activities }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

const holonWalletActivities = async (citizen, walletContract) => {
  try {
    const transactionsCount = await walletContract.callSmartContractGetFunc('getTotalHolonDonation', [citizen]);
    const futurePayouts = []
    const pastPayouts = []
    for (let i = 1; i <= transactionsCount; i++) {
      const activity = await walletContract.callSmartContractGetFunc('getHolonActivity', [citizen, i]);
      if (activity.transactionType === 'credit') {
        futurePayouts.push(activity)
      } else {
        pastPayouts.push(activity)
      }
    }
    return { success: true, activities: { futurePayouts, pastPayouts } }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = {
  getWallet,
  createWallet,
  walletRecord,
  walletActivities,
  holonWalletActivities
}
