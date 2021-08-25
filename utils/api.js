const https = require('https')
const http = require('http')

const fetch = (api, isHttp) =>
  new Promise((resolve, reject) => {
    try {
      const mod = isHttp ? http : https
      mod
        .get(api, res => {
          res.setEncoding('utf8')
          let rawData = ''

          res.on('data', chunk => {
            rawData += chunk
          })

          res.on('end', () => {
            try {
              const parsedData = JSON.parse(rawData)
              resolve(parsedData)
            } catch (e) {
              reject(e.message)
            }
          })
        })
        .end()
    } catch (e) {
      reject(e)
    }
  })

module.exports = {
  fetch,
}
