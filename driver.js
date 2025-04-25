"use strict";
// required: npm install blind-signatures
const blindSignatures = require('blind-signatures');

const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require('./coin.js');
const utils = require('./utils.js');

// Details about the bank's key.
const BANK_KEY = blindSignatures.keyGeneration({ b: 2048 });
const N = BANK_KEY.keyPair.n.toString();
const E = BANK_KEY.keyPair.e.toString();

/**
 * Function signing the coin on behalf of the bank.
 * 
 * @param blindedCoinHash - the blinded hash of the coin.
 * 
 * @returns the signature of the bank for this coin.
 */
function signCoin(blindedCoinHash) {
    return blindSignatures.sign({
        blinded: blindedCoinHash,
        key: BANK_KEY,
    });
}

/**
 * Parses a string representing a coin, and returns the left/right identity string hashes.
 *
 * @param {string} s - string representation of a coin.
 * 
 * @returns {[[string]]} - two arrays of strings of hashes, committing the owner's identity.
 */
function parseCoin(s) {
    let [cnst, amt, guid, leftHashes, rightHashes] = s.split('-');
    if (cnst !== BANK_STR) {
        throw new Error(`Invalid identity string: ${cnst} received, but ${BANK_STR} expected`);
    }
    let lh = leftHashes.split(',');
    let rh = rightHashes.split(',');
    return [lh, rh];
}

/**
 * Procedure for a merchant accepting a token. The merchant randomly selects
 * the left or right halves of the identity string.
 * 
 * @param {Coin} coin - the coin that a purchaser wants to use.
 * 
 * @returns {[String]} - an array of strings, each holding half of the user's identity.
 */
function acceptCoin(coin) {
    const verified = blindSignatures.verify({
        unblinded: coin.signature,
        N: coin.n,
        E: coin.e,
        message: coin.toString()
    });

    if (!verified) {
        throw new Error("Invalid coin signature");
    }

    let [leftHashes, rightHashes] = parseCoin(coin.toString());
    let ris = [];

    for (let i = 0; i < leftHashes.length; i++) {
        const isLeft = utils.randInt(2) === 0;
        const actual = coin.getRis(isLeft, i);
        const hashed = utils.hash(actual);

        if (isLeft && hashed !== leftHashes[i]) {
            throw new Error(`Left hash mismatch at index ${i}`);
        } else if (!isLeft && hashed !== rightHashes[i]) {
            throw new Error(`Right hash mismatch at index ${i}`);
        }

        ris.push(actual.toString('base64'));
    }

    return ris;
}

/**
 * If a token has been double-spent, determine who is the cheater.
 * 
 * @param guid - Globally unique identifier for coin.
 * @param ris1 - Identity string reported by first merchant.
 * @param ris2 - Identity string reported by second merchant.
 */
function determineCheater(guid, ris1, ris2) {
    for (let i = 0; i < ris1.length; i++) {
        const part1 = Buffer.from(ris1[i], 'base64');
        const part2 = Buffer.from(ris2[i], 'base64');

        if (part1.equals(part2)) continue;

        const xorResult = Buffer.alloc(part1.length);
        for (let j = 0; j < part1.length; j++) {
            xorResult[j] = part1[j] ^ part2[j];
        }

        const id = xorResult.toString();
        if (id.startsWith(IDENT_STR)) {
            console.log(`Double-spending detected! Coin purchaser revealed: ${id}`);
            return;
        }
    }

    console.log("Double-spending detected, but RIS strings are identical. Merchant is at fault.");
}


// === DEMO ===

let coin = new Coin('alice', 20, N, E);

coin.signature = signCoin(coin.blinded);
coin.unblind();

// Merchant 1 accepts the coin
let ris1 = acceptCoin(coin);

// Merchant 2 accepts the same coin
let ris2 = acceptCoin(coin);

// Detect double-spending
determineCheater(coin.guid, ris1, ris2);
console.log();

// Test identical RIS (merchant fault)
determineCheater(coin.guid, ris1, ris1);
