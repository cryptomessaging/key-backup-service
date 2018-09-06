const AWS = require('aws-sdk');
AWS.config.update({region: 'us-west-2'});
const SES = new AWS.SES({apiVersion: '2010-12-01'});

exports.sendPasswordResetEmail = async function( email, reset_link ) {
    const htmlMessage = "<html><body>"
        + "<p>Someone, perhaps you, requested to reset the Key Backup Service password for <b>" + email + "</b></p>"
        + "<p>If you DID NOT request a password reset, please ignore this email.</p>"
        + "<p>If you DO wish to reset your Key Backup Service password, please visit"
        + " <a href='" + reset_link + "'>" + reset_link + "</a></p>"
        + "</body>"
        + "</html>";

    const CRLF = "\r\n";    
    const textMessage = "Someone, perhaps you, requested to reset the Key Backup Service password for " + email + CRLF + CRLF
        + "If you DID NOT request a password reset, please ignore this email." + CRLF + CRLF
        + "If you DO wish to reset your Key Backup Service password, please visit:" + CRLF + '  ' + reset_link;

    var params = {
        Destination: {
            ToAddresses: [ email ]
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: htmlMessage
                },
                Text: {
                    Charset: "UTF-8",
                    Data: textMessage
                }
            },
            Subject: {
                Charset: 'UTF-8',
                Data: 'You Requested a Password Reset for Cryptomessaging Key Backup Service'
            }
        },
        Source: 'do-not-reply@cryptomessaging.org'
    };

    await SES.sendEmail( params ).promise();
}
