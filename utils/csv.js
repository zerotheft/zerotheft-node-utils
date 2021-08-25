const csvjson = require('csvjson')
const { writeFile } = require('fs')

const convertToCSV = (json, type) => {
  const options = {
    delimiter: ',',
    wrap: false,
    headers: 'key',
  }
  const csvData = csvjson.toCSV(json, options)
  const timestamp = Math.floor(Date.now() / 1000)
  writeFile(`./${timestamp}_${type}.csv`, csvData, err => {
    if (err) {
      console.log(err) // Do something to handle the error or just throw it
    }
    console.log('CSV downloaded in the current directory.')
  })
}

module.exports = {
  convertToCSV,
}
