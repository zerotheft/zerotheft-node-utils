const {
  initiateWeb3,
  instantiateContract,
  carryTransaction,
} = require('./web3');
const { SHOULD_VALIDATE, GAS_PRICE, GAS_LIMIT } = require('../config');
const { ensureAccountLoginAndGetDetails } = require('./storage');
/**
 * Web3 Class helps to carry out the transactions in the blockchain network.
 * The core functionalities of this class are:
 * a)Instantiate web3 which is very much required to identify the network to communicate.
 * b)Based on web3 provider instantiate the contracts in that network.
 * c)Perform read transaction from the blockchain to the particular contract. "callSmartContractGetFunc"
 * d)Perform write transaction into the blockchain network. "createTransaction"
 */
class Web3 {
  constructor(contractName) {
    this.contractName = contractName;
    this.web3 = null;
    this.instance = null;
    this.address = null;
  }

  async init(provider = 'default') {
    if (this.web3 && this.instance) return;
    this.web3 = await initiateWeb3(provider);
    const res = await instantiateContract(this.web3, this.contractName);
    this.instance = res[0];
    this.address = res[1];
  }

  async callSmartContractGetFunc(methodName, args = []) {
    if (!this.web3 || !this.instance) await this.init();
    if (SHOULD_VALIDATE) {
      const storage = await ensureAccountLoginAndGetDetails();
      if (!storage) return;
    }
    return await this.instance.methods[methodName](...args).call();
  }

  async watchEvent(eventName, callback, args = {}) {
    if (!this.web3 || !this.instance) await this.init('websocket');
    this.instance.events[eventName](
      { fromBlock: 0, ...args },
      (error, event) => {
        if (!error && event) {
          callback(event.returnValues);
        } else {
          console.log(error);
        }
      }
    );
  }

  async createTransaction(
    methodName,
    args = [],
    gasLimit = GAS_LIMIT,
    gasPrice = GAS_PRICE,
    accType = 'regular',
    account
  ) {
    if (!this.web3 || !this.instance) await this.init();

    const storage = account || (await ensureAccountLoginAndGetDetails(accType));
    if (!storage) return;

    const functionAbi = this.instance.methods[methodName](...args).encodeABI();
    const without0x = storage.key.split('0x')[1];
    const privateKey = without0x || storage.key;
    return carryTransaction(this.web3, storage.address, privateKey, {
      to: this.address,
      data: functionAbi,
      gasLimit: this.web3.utils.toHex(gasLimit),
      gasPrice: this.web3.utils.toHex(
        this.web3.utils.toWei(gasPrice.toString(), 'gwei')
      ),
    });
  }
}

module.exports = Web3;
