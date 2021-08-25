const yaml = require('js-yaml')
const { isNumber } = require('lodash')

const { fromUnixTime, format } = require('date-fns')

const fs = require('fs')

const HOLONSTATUSES = ['GOOD', 'UNSTABLE', 'DOWN', 'LOST']
const PATHSTATUSES = ['OWNED', 'PROPOSED', 'REVIEWED']

const isURL = str => {
  const urlRegex =
    '^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$'
  const url = new RegExp(urlRegex, 'i')
  return str.length < 2083 && url.test(str)
}

const ROLES = {
  holonowner: { name: 'ZT_HOLONOWNER', alt: 'HolonOwner' },
}

const indexOfStatus = status => HOLONSTATUSES.indexOf(status)

const convertStringDollarToNumeric = summary => {
  try {
    const values = summary.match(/^\$\s?([\d]+|([\d]{1,3},(([\d]{3},)+)?[\d]{3}))(\.[\d]+)?\s?([KMBT])?$/)
    let baseValue = values[1].replace(/,/g, '')
    let multiplier = 1
    if (values[6]) {
      const denotor = values[6].toUpperCase()
      switch (denotor) {
        case 'K':
          multiplier = Math.pow(10, 3)
          break
        case 'M':
          multiplier = Math.pow(10, 6)
          break
        case 'B':
          multiplier = Math.pow(10, 9)
          break
        case 'T':
          multiplier = Math.pow(10, 12)
          break
      }
    }
    baseValue += values[5] || '.0'
    return baseValue * multiplier
  } catch (e) {
    console.log(e)
    return 0
  }
}

const updateProposalYaml = async (yamlFile, newVal) =>
  new Promise((resolve, reject) => {
    const doc = yaml.safeLoad(fs.readFileSync(yamlFile, 'utf8'))
    doc.proposal = newVal
    fs.writeFile(yamlFile, yaml.safeDump(doc, { skipInvalid: true }).replace(/: ?>/g, ': |'), err => {
      if (err) {
        reject(err)
      }
      resolve()
    })
  })
const getDate = (date, dateFormat = 'dd MMM, yyyy') => date && format(new Date(date), dateFormat)

const convertUNIXtoDATETIME = (date, dateFormat = 'dd MMM, yyyy') => {
  if (!date) return null
  return getDate(fromUnixTime(date), dateFormat)
}
const abbreviateNumber = (value, decimal = 2) => {
  if (!isNumber(value) || value === 0) return value
  if (value < 1e3) return value.toFixed(decimal)
  if (value >= 1e3 && value < 1e6) return `${+(value / 1e3).toFixed(decimal)}K`
  if (value >= 1e6 && value < 1e9) return `${+(value / 1e6).toFixed(decimal)}M`
  if (value >= 1e9 && value < 1e12) return `${+(value / 1e9).toFixed(decimal)}B`
  if (value >= 1e12 && value < 1e15) return `${+(value / 1e12).toFixed(decimal)}T`
  if (value >= 1e15 && value < 1e18) return `${+(value / 1e15).toFixed(decimal)}Qua`
  if (value >= 1e18) return `${+(value / 1e18).toFixed(decimal)}Qui`
}

module.exports = {
  ROLES,
  HOLONSTATUSES,
  PATHSTATUSES,
  indexOfStatus,
  convertStringDollarToNumeric,
  updateProposalYaml,
  isURL,
  getDate,
  convertUNIXtoDATETIME,
  abbreviateNumber,
}
