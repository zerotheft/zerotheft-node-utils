const { mean, uniq } = require('lodash')
const { getCitizen, getCitizenIdByAddress } = require('./citizens')
const { getFeedbackContractVersion } = require('./feedbacks')
const { getHolonContract, getFeedbackContract } = require('../utils/contract')
const { getStorageValues } = require('../utils/storage')
const { signMessage } = require('../utils/web3')

const contractIdentifier = 'ZTMHolon'

/**
 * Get the version of holon contract version
 * @param {object} holonContract Instance of holon contract
 * @returns Object with holon contract version information
 */
const getHolonContractVersion = async (holonContract = null) => {
  if (!holonContract) {
    holonContract = await getHolonContract()
  }
  try {
    const versionNumber = await holonContract.callSmartContractGetFunc('getContractVersion')
    return {
      success: true,
      version: `v${versionNumber}`,
      number: versionNumber,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/* get all citizen ids */
const listHolonIds = async (contract = null) => {
  if (contract === null) {
    contract = getHolonContract()
  }
  const verRes = await getHolonContractVersion(contract)
  let version = verRes.number
  const allHolons = {}
  let allHolonsCount = 0
  while (version > 0) {
    let versionHolons = []
    let cursor = 0
    const howMany = 1000 // Get thousands at a time
    try {
      do {
        const holons = await contract.callSmartContractGetFunc('getHolonIndicesByCursor', [cursor, howMany, version])
        versionHolons = versionHolons.concat(holons)
        cursor += howMany
      } while (1)
    } catch (e) {
      console.log(e.message)
    }
    allHolons[`v${version}`] = versionHolons
    allHolonsCount += versionHolons.length
    version--
  }
  return { allHolons, allHolonsCount }
}

/**
 * List all the addresses of a citizens who selected a holon
 * @param contract Instanace of ZTMHolons contract
 * @param holonID ID of holon whose users need to be extracted
 * @return allCitizens Object with list of citizens addresses per contract version
 */
const listHolonCitizens = async (contract = null, holonID) => {
  if (contract === null) {
    // eslint-disable-next-line no-param-reassign
    contract = getHolonContract()
  }
  const verRes = await getHolonContractVersion(contract)
  let version = verRes.number
  let allCitizens = []
  while (version > 0) {
    try {
      const citizens = await contract.callSmartContractGetFunc('getHolonCitizens', [holonID, version])
      allCitizens = allCitizens.concat(citizens)
    } catch (e) {
      console.log(e.message)
    }
    version--
  }
  return allCitizens
}

/**
 * Get all the holon IDs from indices and their respective belonging version.
 */
const getHolonIds = async (contract = null) => {
  if (contract === null) {
    contract = getHolonContract()
  }

  let allHolonIDs = []
  const { allHolons, allHolonsCount } = await listHolonIds(contract)
  Object.keys(allHolons).forEach(version => {
    const holonIDs = allHolons[version].map(index => `${contractIdentifier}:${version}:${index}`)
    allHolonIDs = allHolonIDs.concat(holonIDs)
  })
  return allHolonIDs
}
/* get holon information based on holon address */
const getHolon = async (holonContract, holonID) => {
  try {
    const holonInfo = await holonContract.callSmartContractGetFunc('getHolon', [holonID])
    const holonData = {
      name: holonInfo.holonName,
      url: holonInfo.holonURL,
      health: holonInfo.status,
      donationAddress: holonInfo.donationAddress,
    }
    return { success: true, holonData }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Fetch the respective index of holon address
 * @param {string} holonAddress address of a holon
 * @param {object} holonContract instance of a holon contract
 * @returns object with holonID information wrt holon address
 */
const getHolonIdByAddress = async (holonAddress, holonContract = null) => {
  if (!holonContract) {
    holonContract = await getHolonContract()
  }
  try {
    const holonRes = await holonContract.callSmartContractGetFunc('getHolonAddressIndex', [holonAddress])

    return {
      success: true,
      holonIndex: holonRes.holonIndex,
      holonID: holonRes.holonID,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/* Get the Basic information of all holons  */
const getHolons = async (type = 'array', holonHandler = null) => {
  if (holonHandler === null) {
    holonHandler = await getHolonContract()
  }
  const holonIds = await getHolonIds()
  const holonList = []
  const holonObj = {}
  if (holonIds) {
    for (const holonKey of holonIds) {
      const holonInfo = await holonHandler.callSmartContractGetFunc('getHolon', [holonKey])

      if (Object.keys(holonInfo).length > 0) {
        const objParms = {
          name: holonInfo.holonName || '',
          url: holonInfo.holonURL,
          health: holonInfo.status,
          owner: holonInfo.owner,
          donationAddress: holonInfo.donationAddress,
        }
        type === 'array' ? holonList.push(objParms) : (holonObj[holonKey] = objParms)
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
    // check if citizen is already a donor of the holon
    const res = await holonContract.callSmartContractGetFunc('getHolonDonors', [holonAddress])
    const donorIdx = res.allDonors.map(a => a.toLowerCase()).indexOf(storage.address.toLowerCase())
    // if not then add in the donor list
    if (donorIdx < 0) {
      await holonContract.createTransaction('addHolonDonor', [holonAddress, storage.address])
    }

    return { success: true, message: 'citizen added  in the donor list' }
  } catch (e) {
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
    // check if citizen is already a donor of the holon
    const res = await holonContract.callSmartContractGetFunc('getHolonDonors', [holonAddress])
    const donorIdx = res.allDonors.map(a => a.toLowerCase()).indexOf(storage.address.toLowerCase())
    // if yes then remove from the donor's list
    if (donorIdx >= 0) {
      await holonContract.createTransaction('removeHolonDonor', [holonAddress, donorIdx])
    }

    return { success: true, message: 'citizen removed  from the donor list' }
  } catch (e) {
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
    const verRes = await getFeedbackContractVersion(feedbackContract)
    let version = verRes.number
    let allFeedbackers = []
    while (version > 0) {
      const feedbackers = await feedbackContract.callSmartContractGetFunc('totalHolonRaters', [holonID, version])
      allFeedbackers = allFeedbackers.concat(feedbackers)
      version--
    }
    const ratingPromises = uniq(allFeedbackers).map(async feedbacker => {
      const feedback = await feedbackContract.callSmartContractGetFunc('getHolonRating', [holonID, feedbacker])
      return parseInt(feedback.rating)
    })
    const allRatings = await Promise.all(ratingPromises)
    return { success: true, count: uniq(allFeedbackers).length, rating: mean(allRatings) || 0 }
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
    const complaints = {}
    let allComplainers = []
    const verRes = await getFeedbackContractVersion(feedbackContract)
    let version = verRes.number
    while (version > 0) {
      const complainers = await feedbackContract.callSmartContractGetFunc('totalHolonCommentors', [holonID, version])
      allComplainers = allComplainers.concat(complainers)
      version--
    }
    const complaintPromises = allComplainers.map(async complainer => {
      const countRes = await feedbackContract.callSmartContractGetFunc('countCitizenCommentsToHolon', [
        holonID,
        complainer,
      ])
      const cres = await getCitizenIdByAddress(complainer)
      const citizenInfo = await getCitizen(cres.citizenID)
      for (let i = 1; i <= parseInt(countRes); i++) {
        try {
          const complaintInfo = await feedbackContract.callSmartContractGetFunc('getCitizenCommentToHolon', [
            holonID,
            complainer,
            i,
          ])
          complaints[complaintInfo.date] = {
            complainer: citizenInfo.name,
            description: complaintInfo.description,
            date: complaintInfo.date,
          }
        } catch (e) {
          console.log(e)
        }
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
  const ratingData = await holonRating(feedbackContract, holonID)
  const commentData = await holonComplaints(feedbackContract, holonID)
  if (!ratingData.success || !commentData.success) {
    return { success: false, error: ratingData.error || commentData.error }
  }
  return { success: true, ratingData, commentData }
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
    const countRes = await feedbackContract.callSmartContractGetFunc('countCitizenCommentsToHolon', [
      holonID,
      citizenAddress,
    ])
    const cres = await getCitizenIdByAddress(citizenAddress)
    const citizenInfo = await getCitizen(cres.citizenID)
    for (let i = 1; i <= parseInt(countRes); i++) {
      const complaintInfo = await feedbackContract.callSmartContractGetFunc('getCitizenCommentToHolon', [
        holonID,
        citizenAddress,
        i,
      ])
      complaints[complaintInfo.date] = {
        complainer: citizenInfo.name,
        description: complaintInfo.description,
        date: complaintInfo.date,
      }
    }
    return {
      success: true,
      ratingData: { rating: parseInt(feedback.rating), createdAt: feedback.createdAt, updatedAt: feedback.updatedAt },
      complaintData: complaints,
    }
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
    const res = await listHolonCitizens(holonContract, holonAddress)
    return { success: true, citizens: res }
  } catch (e) {
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
    // check if citizen is already in a citizen's list of holon
    const allCitizens = await listHolonCitizens(holonContract, holonAddress)
    const citizenIdx = allCitizens.map(a => a.toLowerCase()).indexOf(storage.address.toLowerCase())
    // if not then add in the citizen's list
    // if (citizenIdx < 0)

    const params = [
      { t: 'string', v: holonAddress },
      { t: 'address', v: storage.address },
    ]
    const signedMessage = await signMessage(params)
    await holonContract.createTransaction('addHolonCitizen', [holonAddress, storage.address, signedMessage.signature])

    return { success: true, message: 'citizen added  in the holon citizen list' }
  } catch (e) {
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
    // check if citizen is already in a citizen's list of holon
    const allCitizens = await listHolonCitizens(holonContract, holonAddress)
    const citizenIdx = allCitizens.map(a => a.toLowerCase()).indexOf(storage.address.toLowerCase())
    // if yes then remove from the donor's list
    const params = [
      { t: 'string', v: holonAddress },
      { t: 'address', v: storage.address },
    ]
    const signedMessage = await signMessage(params)
    if (citizenIdx >= 0) {
      await holonContract.createTransaction('removeHolonCitizen', [
        holonAddress,
        storage.address,
        signedMessage.signature,
      ])
    }

    return { success: true, message: 'citizen removed  from the holon citizens list' }
  } catch (e) {
    throw e
  }
}
module.exports = {
  contractIdentifier,
  listHolonIds,
  listHolonCitizens,
  getHolonIds,
  getHolonContractVersion,
  getHolonIdByAddress,
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
