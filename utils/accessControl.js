const { ROLES } = require('./helpers')
const { getPermissionContract, getUserContract } = require('./contract')
const { convertStringToHash } = require('./web3');

const grantRole = async (user, role) => {
  try {
    const permissionContract = getPermissionContract()
    const roleBytes = convertStringToHash(ROLES[role].name)
    //Check if user is already assigned this particular role
    const hasRole = await permissionContract.callSmartContractGetFunc('hasRole', [roleBytes, user], 900000)

    if (!hasRole) {
      try {
        const userContract = getUserContract()
        //  Assign roles to user address
        await permissionContract.createTransaction(`add${ROLES[role].alt}`, [user], 900000)
        //push roles in user roles list
        await userContract.createTransaction('updateUserRole', [user, roleBytes], 900000)

        await userContract.callSmartContractGetFunc('getUserRoles', [user], 900000)
      } catch (e) {
        throw (e)
      }
    }
  } catch (e) {
    throw (e)
  }
}

const revokeRole = async (user, role) => {
  try {
    const permissionContract = getPermissionContract()
    const userContract = getUserContract()

    let userRoles = await userContract.callSmartContractGetFunc('getUserRoles', [user], 900000)

    //  Remove user role
    await permissionContract.createTransaction(`remove${ROLES[role].alt}`, [user], 900000)

    //pop roles from user roles list
    let roleIndex = userRoles.map(u => u.toLowerCase()).indexOf(convertStringToHash(ROLES[role].name))
    if (roleIndex > -1) {
      await userContract.createTransaction('removeUserRole', [roleIndex, user], 900000)
    }
  } catch (e) {
    throw (e)
  }
}

const transferHolonOwner = async (user) => {
  try {
    const permissionContract = getPermissionContract()

    //add holon admin role to the user
    await permissionContract.createTransaction('transferHolonOwner', [user], 900000)
  } catch (e) {
    throw (e)
  }
}

const hasRole = async (user, role) => {
  try {
    const permissionContract = getPermissionContract()
    return await permissionContract.callSmartContractGetFunc('withRole', [convertStringToHash(role), user], 900000)
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
