const { getFeedbackContract } = require('../utils/contract')

/**
 * Get the version of feedback contract version
 * @param {object} feedbackContract Instance of feedback contract
 * @returns Object with feedback contract version information
 */
const getFeedbackContractVersion = async (feedbackContract = null) => {
  if (!feedbackContract) {
    feedbackContract = await getFeedbackContract()
  }
  try {
    const versionNumber = await feedbackContract.callSmartContractGetFunc('getContractVersion')
    return {
      success: true,
      version: `v${versionNumber}`,
      number: versionNumber,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }

}

module.exports = {
  getFeedbackContractVersion,
}
