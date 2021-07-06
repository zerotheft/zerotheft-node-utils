const { ROLES } = require('./helpers')
const { getPermissionContract, getCitizenContract } = require('./contract')
const { convertStringToHash } = require('./web3');

const grantRole = async (citizen, role) => {
  try {
    const permissionContract = getPermissionContract()
    const roleBytes = convertStringToHash(ROLES[role].name)
    //Check if citizen is already assigned this particular role
    const hasRole = await permissionContract.callSmartContractGetFunc('hasRole', [roleBytes, citizen], 900000)

    if (!hasRole) {
      try {
        const citizenContract = getCitizenContract()
        //  Assign roles to citizen address
        await permissionContract.createTransaction(`add${ROLES[role].alt}`, [citizen], 900000)
        //push roles in citizen roles list
        // await citizenContract.createTransaction('updateCitizenRole', [citizen, roleBytes], 900000)

        // await citizenContract.callSmartContractGetFunc('getCitizenRoles', [citizen], 900000)
      } catch (e) {
        throw (e)
      }
    }
  } catch (e) {
    throw (e)
  }
}

const revokeRole = async (citizen, role) => {
  try {
    const permissionContract = getPermissionContract()
    const citizenContract = getCitizenContract()

    let citizenRoles = await citizenContract.callSmartContractGetFunc('getCitizenRoles', [citizen], 900000)

    //  Remove citizen role
    await permissionContract.createTransaction(`remove${ROLES[role].alt}`, [citizen], 900000)

    //pop roles from citizen roles list
    let roleIndex = citizenRoles.map(u => u.toLowerCase()).indexOf(convertStringToHash(ROLES[role].name))
    if (roleIndex > -1) {
      await citizenContract.createTransaction('removeCitizenRole', [roleIndex, citizen], 900000)
    }
  } catch (e) {
    throw (e)
  }
}

const transferHolonOwner = async (citizen) => {
  try {
    const permissionContract = getPermissionContract()

    //add holon admin role to the citizen
    await permissionContract.createTransaction('transferHolonOwner', [citizen], 900000)
  } catch (e) {
    throw (e)
  }
}

const hasRole = async (citizen, role) => {
  try {
    const permissionContract = getPermissionContract()
    return await permissionContract.callSmartContractGetFunc('withRole', [convertStringToHash(role), citizen], 900000)
  } catch (e) {
    throw (e)
  }
}


module.exports = {
  grantRole,
  revokeRole,
  transferHolonOwner,
  hasRole
}
