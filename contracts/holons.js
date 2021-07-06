const { mean, uniq } = require('lodash');
const { getCitizen } = require('./citizens')
const { getHolonContract, getFeedbackContract } = require('../utils/contract')
const { getStorageValues } = require('../utils/storage')

/* get holon information based on holon address */
const getHolon = async (holonContract, holonID) => {
  try {
    const holonInfo = await holonContract.callSmartContractGetFunc('getHolon', [holonID]);
    const holonDetails = JSON.parse(holonInfo.details)
    const holonData = {
      url: holonDetails.name || holonDetails.url,
      health: holonInfo.status,
      countryCode: holonDetails.country,
      proxyAddr: holonInfo.proxyAddr
    };
    return { success: true, holonData }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
/* Return ALL Holon Services available */
const getHolons = async (type = 'array', holonHandler = null) => {
  if (holonHandler === null) {
    holonHandler = await getHolonContract();
  }
  const holonIds = await holonHandler.callSmartContractGetFunc('getHolonIds');
  let holonList = []
  let holonObj = {}
  if (holonIds) {
    for (const holonId of holonIds) {
      const holonDetails = await holonHandler.callSmartContractGetFunc('getHolon', [holonId]);
      const holonInfo = JSON.parse(holonDetails.details)

      if (Object.keys(holonInfo).length > 0) {
        let objParms = {
          name: holonInfo.name || "",
          url: holonInfo.url,
          health: holonDetails.status,
          country: holonInfo.country,
          address: holonId,
          proxyAddr: holonDetails.proxyAddr
        }
        type === 'array' ? holonList.push(objParms) :
          holonObj[holonId] = objParms
      }
    }
  }
  return type === 'array' ? holonList : holonObj
}

const addHolonDonor = async (holonAddress, holonContract = null) => {
  try {
    if (!holonContract) {
      holonContract = getHolonContract()
      holonContract.init()
    }
    const storage = await getStorageValues()
    //check if citizen is already a donor of the holon
    const res = await holonContract.callSmartContractGetFunc('getHolonDonors', [holonAddress]);
    const donorIdx = res.allDonors.map(a => a.toLowerCase()).indexOf(storage.address.toLowerCase())
    //if not then add in the donor list
    if (donorIdx < 0)
      await holonContract.createTransaction('addHolonDonor', [holonAddress, storage.address])

    return { success: true, message: 'citizen added  in the donor list' }
  }
  catch (e) {
    throw e
  }
}

const removeHolonDonor = async (holonAddress, holonContract = null) => {
  try {
    if (!holonContract) {
      holonContract = getHolonContract()
      holonContract.init()
    }
    const storage = await getStorageValues()
    //check if citizen is already a donor of the holon
    const res = await holonContract.callSmartContractGetFunc('getHolonDonors', [holonAddress]);
    const donorIdx = res.allDonors.map(a => a.toLowerCase()).indexOf(storage.address.toLowerCase())
    //if yes then remove from the donor's list
    if (donorIdx >= 0)
      await holonContract.createTransaction('removeHolonDonor', [holonAddress, donorIdx])

    return { success: true, message: 'citizen removed  from the donor list' }
  }
  catch (e) {
    throw e
  }
}

/**
 * Get the rating information of a particular holon
 * @param {object} feedbackContract - instance of a feedback contract
 * @param {string} holonID - address of a holon
 * @returns json object with holon rating information
 */
const holonRating = async (feedbackContract, holonID) => {
  try {
    const feedbackers = await feedbackContract.callSmartContractGetFunc('totalHolonRaters', [holonID])
    let ratingPromises = uniq(feedbackers).map(async (feedbacker) => {
      const feedback = await feedbackContract.callSmartContractGetFunc('getHolonRating', [holonID, feedbacker])
      return parseInt(feedback.rating)
    })
    const allRatings = await Promise.all(ratingPromises)
    return { success: true, count: uniq(feedbackers).length, rating: mean(allRatings) || 0 }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Get Holon comments provided by citizen
 * @param {object} feedbackContract - feeback contract instance
 * @param {string} holonID - address of a holon
 * @returns holon  comments data as JSON
 */
const holonComplaints = async (feedbackContract, holonID) => {
  try {
    let complaints = {}
    const complainers = await feedbackContract.callSmartContractGetFunc('totalHolonCommentors', [holonID])
    let complaintPromises = complainers.map(async (complainer) => {
      const countComplaints = await feedbackContract.callSmartContractGetFunc('countCitizenCommentsToHolon', [holonID, complainer]);
      const citizenInfo = await getCitizen(complainer);
      for (let i = 1; i <= parseInt(countComplaints); i++) {
        let complaintInfo = await feedbackContract.callSmartContractGetFunc('getCitizenCommentToHolon', [holonID, complainer, i]);
        complaints[complaintInfo.date] = { complainer: citizenInfo.name, description: complaintInfo.description, date: complaintInfo.date }
      }
    })
    await Promise.all(complaintPromises)

    return { success: true, count: Object.keys(complaints).length, allComplaints: complaints }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Get Holon feedback(both rating and comments)
 * @param {string} holonID - address of a holon
 * @param {object} feedbackContract - instance of a feedback contract
 * @returns holon ratings and comments data as JSON
 */
const holonFeedback = async (holonID, feedbackContract = null) => {
  if (!feedbackContract) {
    feedbackContract = getFeedbackContract()
    feedbackContract.init()
  }
  const ratingData = await holonRating(feedbackContract, holonID);
  const commentData = await holonComplaints(feedbackContract, holonID);
  if (!ratingData.success || !commentData.success) {
    return { success: false, error: ratingData.error || commentData.error };
  }
  return { success: true, ratingData, commentData };
}

/**
 * Get individual citizen's feedback on a specific Holon
 * @param {string} holonID - address of a holon
 * @param {string} citizenAddress - address of a citizen
 * @param {object} feedbackContract - instance of a feedback contract
 * @returns rating and comments passed by specific citizen
 */
const citizenFeedback = async (holonID, citizenAddress, feedbackContract = null) => {
  try {
    if (!feedbackContract) {
      feedbackContract = getFeedbackContract()
      feedbackContract.init()
    }
    const complaints = {}
    const feedback = await feedbackContract.callSmartContractGetFunc('getHolonRating', [holonID, citizenAddress])
    const countComplaints = await feedbackContract.callSmartContractGetFunc('countCitizenCommentsToHolon', [holonID, citizenAddress]);
    const citizenInfo = await getCitizen(citizenAddress);
    for (let i = 1; i <= parseInt(countComplaints); i++) {
      let complaintInfo = await feedbackContract.callSmartContractGetFunc('getCitizenCommentToHolon', [holonID, citizenAddress, i]);
      complaints[complaintInfo.date] = { complainer: citizenInfo.name, description: complaintInfo.description, date: complaintInfo.date }
    }
    return { success: true, ratingData: { rating: parseInt(feedback.rating), createdAt: feedback.createdAt, updatedAt: feedback.updatedAt }, complaintData: complaints };
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/*
* Get the list of citizens who selected the holon
*/
const getHolonCitizens = async (holonAddress, holonContract = null) => {
  try {
    if (!holonContract) {
      holonContract = getHolonContract()
      holonContract.init()
    }
    const res = await holonContract.callSmartContractGetFunc('getHolonCitizens', [holonAddress]);
    return { success: true, citizens: res }
  }
  catch (e) {
    throw e
  }
}
/*
* Add holon citizen who selects the holon in the citizen list
*/
const addHolonCitizen = async (holonAddress, holonContract = null) => {
  try {
    if (!holonContract) {
      holonContract = getHolonContract()
      holonContract.init()
    }
    const storage = await getStorageValues()
    //check if citizen is already in a citizen's list of holon
    const allCitizens = await holonContract.callSmartContractGetFunc('getHolonCitizens', [holonAddress]);
    const citizenIdx = allCitizens.map(a => a.toLowerCase()).indexOf(storage.address.toLowerCase())
    //if not then add in the citizen's list
    if (citizenIdx < 0)
      await holonContract.createTransaction('addHolonCitizen', [holonAddress, storage.address])

    return { success: true, message: 'citizen added  in the holon citizen list' }
  }
  catch (e) {
    throw e
  }
}
/*
* Remove holon citizen who de-selects the holon from the citizen list
*/
const removeHolonCitizen = async (holonAddress, holonContract = null) => {
  try {
    if (!holonContract) {
      holonContract = getHolonContract()
      holonContract.init()
    }
    const storage = await getStorageValues()
    //check if citizen is already in a citizen's list of holon
    const allCitizens = await holonContract.callSmartContractGetFunc('getHolonCitizens', [holonAddress]);
    const citizenIdx = allCitizens.map(a => a.toLowerCase()).indexOf(storage.address.toLowerCase())
    //if yes then remove from the donor's list
    if (citizenIdx >= 0)
      await holonContract.createTransaction('removeHolonCitizen', [holonAddress, storage.address, citizenIdx])

    return { success: true, message: 'citizen removed  from the holon citizens list' }
  }
  catch (e) {
    throw e
  }
}
module.exports = {
  getHolon,
  getHolons,
  addHolonDonor,
  removeHolonDonor,
  holonRating,
  holonComplaints,
  holonFeedback,
  citizenFeedback,
  getHolonCitizens,
  addHolonCitizen,
  removeHolonCitizen,
}
