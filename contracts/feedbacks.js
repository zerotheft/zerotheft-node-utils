const { getFeedbackContract } = require('../utils/contract')

/**
 * Get the version of feedback contract version
 * @param {object} getFeedbackContract Instance of feedback contract
 * @returns Object with feedback contract version information
 */
const getFeedbackContractVersion = async (feedbackContract = null) => {
  if (!feedbackContract) {
    feedbackContract = await getFeedbackContract()
  }
  try {
    const version = await feedbackContract.callSmartContractGetFunc('getContractVersion')
    return {
      success: true,
      version,
      number: version.split('v')[1],
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = {
  getFeedbackContractVersion,
}
