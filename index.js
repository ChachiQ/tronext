const config = require('./config');
const moment = require('moment');
import TronWeb from 'tronweb'
const optimist = require('optimist');

const fullNode = 'https://api.trongrid.io';
const solidityNode = 'https://api.trongrid.io';
const eventServer = 'https://api.trongrid.io/';

const tronWeb = new TronWeb(
    fullNode,
    solidityNode,
    eventServer,
    config.privateKey
);

const refTronWeb = new TronWeb(
    fullNode,
    solidityNode,
    eventServer,
    config.ref1PrivateKey
)
const userAddress = config.address;

const DICE_CONTRACT_ADDRESS = 'TJUWKa3esTw9ou1nFsYViF6YK5HoYtzmzH'
// const LUCKY_CONTRACT_ADDRESS = "TAvU1vUzYfyX8bJNmjk5hqPkUycHDJVuvJ"
// const SLOT_CONTRACT_ADDRESS = "TFyWuh9tQn3YieH2hakK7y7r25KsbKS9Dy"
const TOKEN_CONTRACT_ADDRESS = "TRi5fEYrPVK5kczmShn38L345kcREZg83m"

const BetAmount = 1000 * 1000000; //1000 trx

var dice_contract,
    token_contract;


var withdrawing = false;
var freezing = false;
var commonds;

const app = async () => {
    commonds = optimist.argv['_'][0];
    if (!commonds) {
        commonds = 'widthdraw';
    }
    dice_contract = await getContract(DICE_CONTRACT_ADDRESS);
    token_contract = await getContract(TOKEN_CONTRACT_ADDRESS);

    console.log(optimist.argv)

    if (commonds === 'bet') {
        await bet();
    } else if (commonds === 'widthdraw') {
        await widthdraw();
    }
};

app();

async function widthdraw() {
    try {
        await takeReferralTokens()
        await transferTNX()
    } catch (e) {
        console.log(e)
    }
}

async function bet() {
    console.log('start bet');
    while (true) {
        let p1 = dice_contract.bet(49, 0, config.myReferrals).send({
            callValue: Number(BetAmount),
            shouldPollResponse: false
        });

        let p2 = dice_contract.bet(50, 1, config.myReferrals).send({
            callValue: Number(BetAmount),
            shouldPollResponse: false
        });

        try {
            await Promise.all([p1, p2]);
        } catch (e) {
            console.log(e)
            console.log('continue...')
        }

        let date = new Date();
        let roundDate = roundMinutes(date);
        if ((roundDate.getTime() - date.getTime()) / 1000 < 5 * 60) {
            // console.log('checkBalance')
            if (!withdrawing && !freezing) {
                checkTokenBalance()
            }
        }
        await sleep(6000); //sleeep 6 secs
    }
}


function checkTokenBalance() {
    token_contract.tokenBalances(userAddress).call().then(function(result) {

        let available_balance = result[1].toNumber();
        let withdrawn_balance = result[0].toNumber();
        let frozen_balance = result[2].toNumber();

        if (available_balance >= 150 * 1000000 && !withdrawing) {
            console.log(`move tokens: ${available_balance / 1000000}`)
            withdrawing = true;
            token_contract.moveTokensFrom(available_balance).send({
                callValue: 0,
                shouldPollResponse: false
            }).then(function(result) {
                setTimeout(function() {
                    withdrawing = false;
                }, 2000);
            }).catch(function(error) {
                console.log('move tokens failed')
                console.log(error)
                withdrawing = false;
            });

        }

        if (withdrawn_balance >= 150 * 1000000 && !freezing) {
            console.log(`freeze tokens: ${withdrawn_balance / 1000000}`)
            freezing = true;
            token_contract.freezeToken(withdrawn_balance).send({
                callValue: 0,
                shouldPollResponse: false
            }).then(function(result) {
                setTimeout(function() {
                    freezing = false;
                }, 2000);
            }).catch(function(error) {
                console.log('freeze tokens failed')
                console.log(error)
                freezing = false;
            });
        }

    }).catch(function(error) {
        console.log('Error get token balance');
        console.log(error);
    });
}

async function takeReferralTokens() {
    let contract = await refTronWeb.contract().at(TOKEN_CONTRACT_ADDRESS);
    let result = await (contract.getReferralBalances(config.myReferrals[0]).call())

    let balanceTrx = result[0].toNumber();
    let balanceToken = result[1].toNumber();

    console.log(`Referral Rewards Token: ${fromSun(balanceToken)} TNX , ${fromSun(balanceTrx)} TRX`)

    try {
        if (balanceToken > 0 * 1000000) {
            console.log(`widthdrawing ${fromSun(balanceToken - balanceToken % 1000000)} TNX...`)
            await (token_contract.takeReferralToken(balanceToken - balanceToken % 1000000).send({
                callValue: 0,
                shouldPollResponse: true
            }))
        }

        if (balanceTrx > 1000 * 1000000) {
            console.log(`widthdrawing ${fromSun(balanceTrx)} TRX...`)
            await (token_contract.takeReferralTrx(balanceTrx).send({
                callValue: 0,
                shouldPollResponse: true
            }))
        }

        await sleep(6000);
    } catch (e) {
        console.log(e)
    }
}

async function transferTNX() {
    let contract = await refTronWeb.contract().at(TOKEN_CONTRACT_ADDRESS);
    let balance = (await (contract.balanceOf(config.myReferrals[0]).call())).toNumber()

    console.log(`TNX Balance: ${fromSun(balance)}`)

    try {
        if (balance >= 10 * 1000000) {
            console.log(`transfer ${fromSun(balance)} TNX to ${userAddress}`)
            await (token_contract.transfer(userAddress, balance).send({
                callValue: 0,
                shouldPollResponse: true
            }))
        }
        await sleep(6000);
    } catch (e) {
        console.log(e)
    }
}

async function getContract(address) {
    let res = await tronWeb.contract().at(address);
    // console.log(res);
    return res
}

function sleep(ms = 0) {
    return new Promise(r => setTimeout(r, ms));
}

function fromSun(int) {
    return Number(int) / 1000000;
}

function toSun(int) {
    return Number(int) * 1000000;
}

function roundMinutes(date) {
    let d = new Date(date);
    d.setHours(date.getHours() + Math.ceil(date.getMinutes() / 60));
    d.setMinutes(0);
    d.setSeconds(0)

    return d;
}