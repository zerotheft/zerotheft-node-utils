const crypto = require('crypto');
const iv = crypto.randomBytes(16);

function encrypt(text, passcode = 'ZeRoThefT123') {
  let key = crypto.createHash('sha256').update(String(passcode)).digest('base64').substr(0, 32);

  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

function decrypt(text, passcode = 'ZeRoThefT123') {
  let key = crypto.createHash('sha256').update(String(passcode)).digest('base64').substr(0, 32);

  let iv = Buffer.from(text.iv, 'hex');
  let encryptedText = Buffer.from(text.encryptedData, 'hex');
  let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function encryptAmount(amount) {
  let newAmount = amount.slice(1).slice(0, -1).split('')
  const a2zencryptor = 'zerothfislvandqumbcx'
  const pointPlace = '#!@^&*:-+~|'
  let encryptedVal = ''
  for (i = 0; i < newAmount.length; i++) {
    if (newAmount[i] === '.') {
      encryptedVal += pointPlace[Math.floor(Math.random() * 10)]
    } else if (newAmount[i] === ',') {
      encryptedVal += Math.floor(Math.random() * 10)
    } else {
      encryptedVal += a2zencryptor[((i % 2) * 10)+ parseInt(newAmount[i])]
    }
  }
  encryptedVal += amount[amount.length - 1]
  return '$' + encryptedVal.split('').reverse().join('').toUpperCase()
}

function decryptAmount(amountStr) {
  let newAmountStr = amountStr.slice(2).toLowerCase().split('')
  const a2zencryptor = 'zerothfislvandqumbcxkpygwj'
  const pointPlace = '#!@^&*:-+~|'
  let decryptedVal = ''
  for (i = 0; i < newAmountStr.length; i++) {
    if (pointPlace.includes(newAmountStr[i])) {
      decryptedVal += '.'
    } else if (/\d/.test(newAmountStr[i])) {
      decryptedVal += ','
    } else {
      decryptedVal += a2zencryptor.indexOf(newAmountStr[i]) % 10
    }
  }
  return '$' + decryptedVal.split('').reverse().join('') + amountStr.slice(1, 2)
}

module.exports = {
  encrypt,
  decrypt,
  encryptAmount,
  decryptAmount
}
