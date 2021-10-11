// ==UserScript==
// @name         Farm RPG Bot
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds buttons to do some things automatically
// @author       aleho8
// @match        https://farmrpg.com/
// @icon         https://www.google.com/s2/favicons?domain=farmrpg.com
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

class Inventory {
    constructor() {
        this.storage = [];
    }

    removeAll() {
        this.storage = [];
    }

    addItem(id, name, amount) {
        let itemIndex = this.findItemIndex(id)
        if (itemIndex == -1) {
            this.storage.push(new FarmItem(id, name, amount));
        }
        else {
            this.setItemAmount(id, this.storage[itemIndex].amount + amount);
        }
    }

    setItemAmount(id, amount) {
        let itemIndex = this.findItemIndex(id);
        if (itemIndex != -1) {
            if (amount == 0) {
                this.removeItem(id);
            }
            else {
                this.storage[itemIndex].setAmount(amount);
            }
        }
    }

    removeItem(id) {
        let itemIndex = this.findItemIndex(id);
        if (itemIndex != -1) {
            this.storage.splice(itemIndex, 1);
        }
    }

    findItem(id) {
        let itemIndex = this.findItemIndex(id);
        if (itemIndex != -1) return this.storage[itemIndex];
        return null;
    }

    findItemIndex(id) {
        for (let i = 0; i < this.storage.length; i++) {
            if (this.storage[i].id == id) {
                return i;
            }
        }
        return -1;
    }

    hasEnough(id, amount) {
        let item = this.findItem(id);
        if (item != null) return item.amount >= amount;
        return false;
    }

}

class FarmItem {
    constructor(id, name, amount) {
        this.id = id;
        this.name = name;
        this.amount = amount;
    }

    setAmount(amount) {
        this.amount = amount;
    }
}

class Farm {
    constructor(id, rc) {
        this.farmid = id;
        this.rowCount = rc;
        this.coins = 0;
        this.gold = 0;
        this.inventory = new Inventory();

        this.isAutoExploring = false;
    }

    getTileCount() {
        return this.rowCount * 4;
    }

    //Response is how many crops are done
    //https://farmrpg.com/worker.php?cachebuster=RANDOMNUMBER&go=readycount&id=FARMID

    harvestAll() {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            req.addEventListener("load", () => { resolve() });
            req.open("POST", `https://farmrpg.com/worker.php?go=harvestall&id=${this.farmid}`);
            req.send();
        });
    }

    plantAll(plantid) {
        return new Promise(async (resolve, reject) => {
            let plantObj = ShopItems.findShopItemById(plantid);
            if (plantObj == null) {
                reject("No seed with that id.");
                return;
            }
            if (!this.inventory.hasEnough(plantid, farmManager.getTileCount())) {
                reject("notenoughitems");
                return;
            }
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j < 5; j++) {
                    await this.plantOne(plantid, i + 1, j + 1);
                }
            }
            resolve();
        });
    }

    //https://farmrpg.com/worker.php?go=plantseed&id=SEEDID&row=ROW&col=COL&farm=FARMID
    plantOne(plantid, row, col) {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            req.addEventListener("load", () => {
                if (req.status == 200) {
                    resolve(req.responseText);
                }
                else {
                    reject("Request returned " + req.status);
                }
            });
            req.open("POST", `https://farmrpg.com/worker.php?go=plantseed&id=${plantid}&row=${row}&col=${col}&farm=${this.farmid}`);
            req.send();
        });
    }

    //https://farmrpg.com/worker.php?go=sellitem&id=ITEMID&qty=AMOUNT
    sellItems(id, amount) {
        return new Promise((resolve, reject) => {
            if (this.inventory.hasEnough(id, amount)) {
                let req = new XMLHttpRequest();
                req.addEventListener("load", () => {
                    {
                        if (req.status == 200) {
                            resolve(req.responseText);
                        }
                        else {
                            reject("Request returned " + req.status);
                        }

                    }
                });
                req.open("POST", `https://farmrpg.com/worker.php?go=sellitem&id=${id}&qty=${amount}`);
                req.send();
            }
            else {
                reject("notenoughitems");
            }
        });
    }

    //https://farmrpg.com/worker.php?go=buyitem&id=ITEMID&qty=AMOUNT
    buyItems(id, amount) {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            req.addEventListener("load", () => {
                {
                    if (req.status == 200) {
                        if (req.responseText == "cannotafford") {
                            reject(req.responseText);
                            return;
                        }
                        resolve(req.responseText);
                    }
                    else {
                        reject("Request returned " + req.status);
                    }

                }
            });
            req.open("POST", `https://farmrpg.com/worker.php?go=buyitem&id=${id}&qty=${amount}`);
            req.send();
        });
    }

    /**
     * 
     * @returns True if all crops are done, false otherwise
     */
    getReadyCrops() {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            let r = Math.floor(Math.random() * 500000);
            req.addEventListener("load", () => {
                {
                    if (req.status == 200) {
                        if (req.responseText.includes(this.getTileCount() + " Ready")) {
                            resolve(true);
                            return;
                        }
                        resolve(false);
                    }
                    else {
                        reject("Request returned " + req.status);
                    }

                }
            });
            req.open("POST", `https://farmrpg.com/worker.php?cachebuster=${r}&go=readycount&id=${this.farmid}`);
            req.send();
        });
    }

    startAutoExploration(id, waitForStamina, useApple, useOrange) {
        this.isAutoExploring = true;
        let exploreOnce = (_id) => {
            return new Promise((resolve, reject) => {
                let req = new XMLHttpRequest();
                req.open("POST", `https://farmrpg.com/worker.php?go=explore&id=${_id}`);
                req.addEventListener("load", () => {
                    if (req.status == 200) {
                        if (req.responseText == "You have run out of stamina and cannot continue.") {
                            reject("Out of stamina.");
                        }
                        else {
                            resolve();
                        }
                    }
                    else {
                        reject("Request returned " + req.status);
                    }
                });
                req.send();
            });
        }
        let staminaWaitTime = 0;
        let interval = setInterval(() => {
            if (this.isAutoExploring) {
                exploreOnce(id)
                    .then(() => {
                        console.log("[BOT] Autoexploring in (" + id + ")");
                    })
                    .catch(async (msg) => {
                        //this.isAutoExploring = false;
                        if (msg != "Out of stamina.") {
                            console.log("[BOT] Autoexploring stopped");
                            autoExploration_click();
                            clearInterval(interval);
                        }
                        else {
                            let req = new XMLHttpRequest();
                            if (useApple && this.inventory.hasEnough(44, 1)) {
                                console.log("[BOT] Eating an Apple to continue AutoExploration.");
                                req.open("POST", "https://farmrpg.com/worker.php?go=eatapple&id=4");
                                req.addEventListener("load", async () => { await this.refreshInventory(); });
                                req.send();
                            }
                            else if (useOrange && this.inventory.hasEnough(84, 1)) {
                                console.log("[BOT] Drinking an Orange Juice to continue AutoExploration.");
                                req.open("POST", "https://farmrpg.com/worker.php?go=drinkoj&id=4");
                                req.addEventListener("load", async () => { await this.refreshInventory(); });
                                req.send();
                            }
                            //TODO
                            /*else if (waitForStamina) { 
                                console.log("[BOT] Waiting for stamina to refill...");
                                staminaWaitTime = 1000 * 120;
                            }*/
                            else {
                                console.log("[BOT] Autoexploring stopped");
                                autoExploration_click();
                                clearInterval(interval);
                            }
                        }
                    });
            }
            else {
                console.log("[BOT] Autoexploring stopped");
                clearInterval(interval);
            }
        }, 1500 + Math.floor(Math.random() * 1000) + 1 + staminaWaitTime);
    }

    //regex    /item\.php\?id=([0-9]+)".*?<strong>(.*?)<\/strong>.*?"item-after">([0-9]+)/gs
    //https://farmrpg.com/#!/inventory.php
    refreshInventory() {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            req.open("GET", `https://farmrpg.com/inventory.php`);
            req.addEventListener("load", () => {
                if (req.status == 200) {
                    this.inventory.removeAll();
                    let resp = req.responseText;
                    let regexp = /item\.php\?id=([0-9]+)".*?<strong>(.*?)<\/strong>.*?"item-after">([0-9]+)/gs;
                    let arr = [...resp.matchAll(regexp)];

                    for (let i = 0; i < arr.length; i++) {
                        this.inventory.addItem(arr[i][1], arr[i][2], arr[i][3]);
                    }
                    resolve();
                    console.log("[BOT] Refreshed inventory");
                }
                else {
                    reject("Request returned " + req.status);
                }
            });
            req.send();
        });
    }

    //regex    /<strong>([0-9|,]+)<\/strong>/gs
    //https://farmrpg.com/worker.php?cachebuster=RANDOMNUMBER&go=getstats
    refreshCurrency() {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            let r = Math.floor(Math.random() * 500000);
            req.open("GET", `https://farmrpg.com/worker.php?cachebuster=${r}&go=getstats`);
            req.addEventListener("load", () => {
                if (req.status == 200) {
                    let regexp = /<strong>([0-9|,]+)<\/strong>/gs;
                    let resp = req.responseText;
                    let arr = [...resp.matchAll(regexp)];
                    this.coins = arr[0][1].replace(",", "");
                    this.gold = arr[1][1].replace(",", "");
                    console.log("[BOT] Refreshed currencies");
                    resolve();
                }
                else {
                    reject("Request returned " + req.status);
                }
            });
            req.send();
        });
    }
}

/**
 * @type Farm
 */
let farmManager;

//MAIN FUNCTION
(function () {
    'use strict';
    injectButton();

    window.onload = async () => {
        farmManager = new Farm(GM_getValue("farmid"), GM_getValue("farmrowcount"));

        setInterval(async () => {
            await farmManager.refreshInventory();
            await farmManager.refreshCurrency();
        }, 240000);

        await farmManager.refreshCurrency();
        await farmManager.refreshInventory();

        console.log("FARMID: " + farmManager.farmid + "\nCOINS: " + farmManager.coins + "\nGOLD: " + farmManager.gold + "\nINVENTORY: " + farmManager.inventory.storage.length + " item(s)");
        console.log(farmManager.inventory.storage);
    };
})();

function saveFarmID_click() {
    let farmid = document.getElementById("FarmID").value;
    let farmrowcount = document.getElementById("farmrowcount").value;
    if (farmid == 0 || farmrowcount == 0) {
        console.error("FarmID or RowCount cant be zero!");
        return;
    }
    GM_setValue("farmid", farmid);
    GM_setValue("farmrowcount", farmrowcount);

    farmManager.farmid = farmid;
    farmManager.rowcount = farmrowcount;
}

function openWindow_click() {
    let botwindow = document.getElementById("botsettingscontainer");
    if (botwindow != null) {
        //console.log("found container");
        if (botwindow.style.display == "block") {
            hideWindow();
        }
        else {
            showWindow();
        }
    }
}

let activeCropChecker = null;
function autoPlant_click() {
    if (activeCropChecker == null) {
        document.getElementById("plantallbtn").innerHTML = "Stop Autofarming";
        return new Promise(async (resolve, reject) => {
            console.log("[BOT] plantAll:" + farmManager.farmid);
            let selectedPlant = ShopItems.findShopItemById(document.getElementById("planteverything").value);
            if (selectedPlant != null) {
                if (await farmManager.getReadyCrops()) {
                    await farmManager.harvestAll();
                }
                farmManager.refreshInventory()
                    .then(() => {
                        console.log("[BOT] Planting " + selectedPlant.name + "...");
                        farmManager.plantAll(selectedPlant.value)
                            .then(async () => {
                                console.log("[BOT] Planted " + selectedPlant.name);
                                if (activeCropChecker != null) {
                                    clearInterval(activeCropChecker);
                                    activeCropChecker = null;
                                }

                                if (activeCropChecker == null) {
                                    activeCropChecker = setInterval(async () => {
                                        console.log("[BOT] Checking for ready crops...");
                                        if (await farmManager.getReadyCrops()) {
                                            console.log("[BOT] Crops are ready!");
                                            let isAutoHarvest = document.getElementById("autoharvest").checked;
                                            if (isAutoHarvest) {
                                                await farmManager.harvestAll();
                                                console.log("[BOT] Autoharvested " + selectedPlant.name);
                                                await farmManager.refreshInventory();
                                            }

                                            let isAutoSell = document.getElementById("autosell").checked;
                                            if (isAutoSell) {
                                                let croptosell = GrownCrops.findGrownCropBySeed(selectedPlant);
                                                if (croptosell != null) {
                                                    farmManager.sellItems(croptosell.value, farmManager.getTileCount()).then(async (m) => {
                                                        await farmManager.refreshInventory();
                                                        await farmManager.refreshCurrency();
                                                        console.log("[BOT] Autosold items worth " + m);
                                                    })
                                                        .catch((msg) => {
                                                            console.log("[BOT] Couldn't sell items! Error: " + msg);
                                                        });
                                                }
                                            }

                                            let isAutoBuy = document.getElementById("autobuy").checked;
                                            if (isAutoBuy) {
                                                farmManager.buyItems(selectedPlant.value, farmManager.getTileCount())
                                                    .then(async () => {
                                                        console.log("[BOT] Bought " + selectedPlant.name);
                                                        await farmManager.refreshInventory();
                                                    })
                                                    .catch((msg) => {
                                                        if (msg == "cannotafford") {
                                                            console.log("[BOT] Not enough money to AutoBuy.");
                                                            document.getElementById("autobuy").checked = false;
                                                        }
                                                    });
                                            }

                                            let isAutoPlant = document.getElementById("autoplant").checked;
                                            if (isAutoPlant) {
                                                clearInterval(activeCropChecker);
                                                activeCropChecker = null;
                                                autoPlant_click();
                                                return;
                                            }
                                            else {
                                                document.getElementById("plantallbtn").innerHTML = "Start Autofarming";
                                                console.log("[BOT] Stopped autofarming");
                                            }

                                            clearInterval(activeCropChecker);
                                            activeCropChecker = null;
                                        }

                                    }, (selectedPlant.time * 1000) / 5);
                                }

                            })
                            .catch((err) => {
                                console.error("[BOT] Couldn't autoplant. Err: " + err);
                                if (err == "notenoughitems") {
                                    let isAutoBuy = document.getElementById("autobuy").checked;
                                    if (isAutoBuy) {
                                        farmManager.buyItems(selectedPlant.value, farmManager.getTileCount())
                                            .then(() => {
                                                console.log("[BOT] Bought " + selectedPlant.name);
                                                autoPlant_click();

                                            })
                                            .catch((msg) => {
                                                if (msg == "cannotafford") {
                                                    console.error("[BOT] Not enough money to AutoBuy.");
                                                    document.getElementById("plantallbtn").innerHTML = "Start Autofarming";
                                                    console.log("[BOT] Stopped autofarming");
                                                }
                                            });
                                    }
                                }
                            });
                        resolve();
                    });
            }
            else {
                console.error("[BOT] No plantable with that ID");
            }
        });
    }
    else {
        document.getElementById("plantallbtn").innerHTML = "Start Autofarming";
        console.log("[BOT] Stopped autofarming");
        clearInterval(activeCropChecker);
        activeCropChecker = null;

    }
}


function harvestAll_click() {
    return new Promise(async (resolve, reject) => {
        console.log("[BOT] harvestAll:" + farmManager.farmid);
        farmManager.harvestAll()
            .then(async () => {
                await farmManager.refreshInventory();
                resolve();
            });
    });
}

//AutoExploration
//Apple: https://farmrpg.com/worker.php?go=eatapple&id=4
//Orange Juice: https://farmrpg.com/worker.php?go=drinkoj&id=4
function autoExploration_click() {
    let btn = document.getElementById("autoexplorebtn");
    let placeChoosen = document.getElementById("autoexplore").value;
    let waitForStam = document.getElementById("waitforstamina").checked;
    let useApple = document.getElementById("useapple").checked;
    let useOrange = document.getElementById("useorange").checked;
    if (!farmManager.isAutoExploring) {
        btn.innerHTML = "Stop Exploration";
        farmManager.startAutoExploration(placeChoosen, waitForStam, useApple, useOrange);
    }
    else {
        farmManager.isAutoExploring = false;
        btn.innerHTML = "Start Exploration";
    }
}


//Window Injection
function injectWindow() {
    let tempdiv = document.createElement("div");
    tempdiv.innerHTML = `<div id="botsettingscontainer" class="view farmrpgplus-view">
    <style>
        #botsettingscontainer {
            z-index: 9999;
            display: none;
            position: absolute;
            left: 1px;
            bottom: 1px;
            width: 450px;
            height: 650px;
            background-color: rgb(0, 0, 0);
            color: rgb(199, 199, 199);
            border: 1px solid black;
        }

        #botsettingscontainer button {
            width: 100%;
        }

        #botsettingscontainer .page-content {
            top: 25px;
        }
    </style>
    <div class="navbar">
        <div class="navbar-inner">
            <div class="center">FarmRPG+</div>
        </div>
    </div>
    <div class="pages">
        <div class="page">
            <div class="page-content">
                <!-- tabs -->
                <div class="tabs-animated-wrap">
                    <div class="tabs">
                        <!-- AutoFarming Tab -->
                        <div id="tab1" class="tab tab-active">
                            <div class="list-block">
                                <ul>
                                    <li>
                                        <a href="#" class="item-link smart-select">
                                            <select name="planteverything" id="planteverything">
                                                <option value="12" selected data-display-as="Pepper Seeds">Pepper Seeds
                                                </option>
                                                <option value="20" data-display-as="Carrot Seeds">Carrot Seeds</option>
                                                <option value="28" data-display-as="Pea Seeds">Pea Seeds</option>
                                                <option value="30" data-display-as="Cucumber Seeds">Cucumber Seeds
                                                </option>
                                                <option value="14" data-display-as="Eggplant Seeds">Eggplant Seeds
                                                </option>
                                                <option value="32" data-display-as="Radish Seeds">Radish Seeds</option>
                                                <option value="34" data-display-as="Onion Seeds">Onion Seeds</option>
                                                <option value="47" data-display-as="Hops Seeds">Hops Seeds</option>
                                                <option value="49" data-display-as="Potato Seeds">Potato Seeds</option>
                                                <option value="16" data-display-as="Tomato Seeds">Tomato Seeds</option>
                                                <option value="51" data-display-as="Leek Seeds">Leek Seeds</option>
                                                <option value="60" data-display-as="Watermelon Seeds">Watermelon Seeds
                                                </option>
                                                <option value="64" data-display-as="Corn Seeds">Corn Seeds</option>
                                                <option value="66" data-display-as="Cabbage Seeds">Cabbage Seeds
                                                </option>
                                                <option value="68" data-display-as="Pumpkin Seeds">Pumpkin Seeds
                                                </option>
                                                <option value="70" data-display-as="Wheat Seeds">Wheat Seeds</option>
                                                <option value="158" data-display-as="Gold Pepper Seeds">Gold Pepper
                                                    Seeds
                                                </option>
                                                <option value="160" data-display-as="Gold Carrot Seeds">Gold Carrot
                                                    Seeds
                                                </option>
                                                <option value="162" data-display-as="Gold Pea Seeds">Gold Pea Seeds
                                                </option>
                                                <option value="190" data-display-as="Gold Cucumber Seeds">Gold Cucumber
                                                    Seeds</option>
                                            </select>
                                            <div class="item-content">
                                                <div class="item-inner">
                                                    <div class="item-title">Seed</div>
                                                    <div class="item-after">Pepper Seeds</div>
                                                </div>
                                            </div>
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div class="list-block">
                                <ul>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="autoharvest" name="autoharvest">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Autoharvest</div>
                                            </div>
                                        </label>
                                    </li>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="autoplant" name="autoplant">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Autoplant</div>
                                            </div>
                                        </label>
                                    </li>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="autobuy" name="autobuy">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Autobuy</div>
                                            </div>
                                        </label>
                                    </li>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="autosell" name="autosell">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Autosell</div>
                                            </div>
                                        </label>
                                    </li>
                                </ul>
                            </div>
                            <button id="plantallbtn" class="button">Start Autofarming</button>
                        </div>
                        <!-- AutoExploration Tab -->
                        <div id="tab2" class="tab">
                            <div class="list-block">
                                <ul>
                                    <li>
                                        <a href="#" class="item-link smart-select">
                                            <select name="autoexplore" id="autoexplore">
                                                <option value="1" selected data-display-as="Small Cave">Small Cave
                                                </option>
                                                <option value="2" data-display-as="Small Spring">Small Spring
                                                </option>
                                                <option value="3" data-display-as="Highland Hills">Highland Hills
                                                </option>
                                                <option value="4" data-display-as="Cane Pole Ridge">Cane Pole Ridge
                                                </option>
                                                <option value="5" data-display-as="Fifth Place">Fifth Place</option>
                                                <option value="6" data-display-as="Sixth Place">Sixth Place</option>
                                                <option value="7" data-display-as="Seventh Place">Seventh Place
                                                </option>
                                                <option value="8" data-display-as="Eighth Place">Eighth Place
                                                </option>
                                            </select>
                                            <div class="item-content">
                                                <div class="item-inner">
                                                    <div class="item-title">Location</div>
                                                    <div class="item-after">Small Cave</div>
                                                </div>
                                            </div>
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div class="list-block">
                                <ul>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="waitforstamina" name="waitforstamina">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Wait for Stamina</div>
                                            </div>
                                        </label>
                                    </li>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="useapple" name="useapple">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Use Apple</div>
                                            </div>
                                        </label>
                                    </li>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="useorange" name="useorange">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Use Orange Juice</div>
                                            </div>
                                        </label>
                                    </li>
                                </ul>
                            </div>
                            <button id="autoexplorebtn" class="button">Start Autoexploring</button>
                        </div>
                        <!-- AutoFishing Tab -->
                        <div id="tab3" class="tab">
                            <div class="list-block">
                                <ul>
                                    <li>
                                        <a href="#" class="item-link smart-select">
                                            <select name="autofishing" id="autofishing">
                                                <option value="1" selected data-display-as="Small Pond">Small Pond
                                                </option>
                                                <option value="2" data-display-as="Farm Pond">Farm Pond
                                                </option>
                                                <option value="3" data-display-as="Forest Pond">Forest Pond
                                                </option>
                                                <option value="4" data-display-as="Lake Tempest">Lake Tempest
                                                </option>
                                                <option value="5" data-display-as="Small Island">Small Island</option>
                                                <option value="6" data-display-as="Crystal River">Crystal River</option>
                                                <option value="7" data-display-as="Seventh Place">Seventh Place
                                                </option>
                                                <option value="8" data-display-as="Eighth Place">Eighth Place
                                                </option>
                                            </select>
                                            <div class="item-content">
                                                <div class="item-inner">
                                                    <div class="item-title">Location</div>
                                                    <div class="item-after">Small Pond</div>
                                                </div>
                                            </div>
                                        </a>
                                    </li>
                                </ul>
                            </div>
                            <div class="list-block">
                                <ul>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="useworms" name="useworms">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Use Worms</div>
                                            </div>
                                        </label>
                                    </li>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="usegrubs" name="usegrubs">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Use Grubs</div>
                                            </div>
                                        </label>
                                    </li>
                                    <li>
                                        <label class="label-checkbox item-content">
                                            <input type="checkbox" id="useminnows" name="useminnows">
                                            <div class="item-media">
                                                <i class="icon icon-form-checkbox"></i>
                                            </div>
                                            <div class="item-inner">
                                                <div class="item-title">Use Minnows</div>
                                            </div>
                                        </label>
                                    </li>
                                </ul>
                            </div>
                            <button id="autofishingbtn" class="button">Start Autofishing</button>
                        </div>
                        <div id="tab4" class="tab">
                            <div class="list-block">
                                <ul>
                                  <li>
                                    <div class="item-content">
                                      <div class="item-inner">
                                        <div class="item-title label">FarmID</div>
                                        <div class="item-input">
                                            <input type="text" id="FarmID" name="FarmID" placeholder="${GM_getValue('farmid')}">
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                  <li>
                                    <div class="item-content">
                                      <div class="item-inner">
                                        <div class="item-title label">Farm RowCount</div>
                                        <div class="item-input">
                                            <input type="number" min="3" max="10" id="farmrowcount" name="farmrowcount" placeholder="${GM_getValue('farmrowcount')}">
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                </ul>
                              </div>  
                            <button id="savefarmdatabtn" class="button">Save</button>
                        </div>
                    </div>
                </div>
            </div>
            <!-- tabbar at bottom -->
            <div class="toolbar tabbar tabbar-labels">
                <div class="toolbar-inner">
                    <a href="#tab1" class="tab-link active">
                        <span class="tabbar-label">AutoFarm</span>
                    </a>
                    <a href="#tab2" class="tab-link">
                        <span class="tabbar-label">AutoExplore</span>
                    </a>
                    <a href="#tab3" class="tab-link">
                        <span class="tabbar-label">AutoFishing</span>
                    </a>
                    <a href="#tab4" class="tab-link">
                        <span class="tabbar-label">Settings</span>
                    </a>
                </div>
            </div>
        </div>
    </div>
</div>`;
    document.getElementsByClassName("views")[0].appendChild(tempdiv);
    let s = document.createElement("script");
    s.innerHTML = `(() => {
        myApp.addView(".farmrpgplus-view", { dynamicNavbar: true });
        console.log("[BOT] Injected view");
    })();`;
    document.body.appendChild(s);

    addListeners();

}

function showWindow() {
    let botwindow = document.getElementById("botsettingscontainer");
    if (botwindow != null) {
        botwindow.style.display = "block";
    }
}

function hideWindow() {
    let botwindow = document.getElementById("botsettingscontainer");
    if (botwindow != null) {
        botwindow.style.display = "none";
    }
}

function injectButton() {
    let navbarleft = document.getElementsByClassName("left")[0];
    let btn = document.createElement("button");
    btn.innerHTML = "FarmRPG+";
    btn.classList = "button";
    btn.onclick = openWindow_click;
    navbarleft.appendChild(btn);
    console.log("[BOT] Injected button");
    injectWindow();
}

function addListeners() {
    //document.getElementById("harvestallbtn").onclick = harvestAll_click;
    document.getElementById("savefarmdatabtn").onclick = saveFarmID_click;
    document.getElementById("plantallbtn").onclick = autoPlant_click;
    document.getElementById("autoexplorebtn").onclick = autoExploration_click;
}

const ShopItems = {
    PEPPER_SEEDS: { value: 12, name: "Pepper Seeds", time: 60 }, //Time is in seconds!
    CARROT_SEEDS: { value: 20, name: "Carrot Seeds", time: 120 },
    PEA_SEEDS: { value: 28, name: "Pea Seeds", time: 180 },
    CUCUMBER_SEEDS: { value: 30, name: "Cucumber Seeds", time: 240 },
    EGGPLANT_SEEDS: { value: 14, name: "Eggplant Seeds", time: 300 },
    RADISH_SEEDS: { value: 32, name: "Radish Seeds", time: 600 },
    ONION_SEEDS: { value: 34, name: "Onion Seeds", time: 900 },
    HOPS_SEEDS: { value: 47, name: "Hops Seeds", time: 1200 },
    POTATO_SEEDS: { value: 49, name: "Potato Seeds", time: 1500 },
    TOMATO_SEEDS: { value: 16, name: "Tomato Seeds", time: 1800 },
    LEEK_SEEDS: { value: 51, name: "Leek Seeds", time: 3600 },
    WATERMELON_SEEDS: { value: 60, name: "Watermelon Seeds", time: 7200 },
    CORN_SEEDS: { value: 64, name: "Corn Seeds", time: 14400 },
    CABBAGE_SEEDS: { value: 66, name: "Cabbage Seeds", time: 28800 },
    PUMPKIN_SEEDS: { value: 68, name: "Pumpkin Seeds", time: 43200 },
    WHEAT_SEEDS: { value: 70, name: "Wheat Seeds", time: 86400 },
    GOLD_PEPPER_SEEDS: { value: 158, name: "Gold Pepper Seeds", time: 60 },
    GOLD_CARROT_SEEDS: { value: 160, name: "Gold Carrot Seeds", time: 120 },
    GOLD_PEA_SEEDS: { value: 162, name: "Gold Pea Seeds", time: 180 },
    GOLD_CUCUMBER_SEEDS: { value: 190, name: "Gold Cucumber Seeds", time: 240 },

    findShopItemById: (id) => {
        for (let shopitem in ShopItems) {
            if (ShopItems[shopitem].hasOwnProperty("value") && ShopItems[shopitem].value == id) return ShopItems[shopitem];
        }
        return null;
    }
}

const GrownCrops = {
    PEPPER: { value: 11, name: "Pepper" },
    CARROT: { value: 19, name: "Carrot" },
    PEA: { value: 27, name: "Pea" },
    CUCUMBER: { value: 29, name: "Cucumber" },
    EGGPLANT: { value: 13, name: "Eggplant" },
    RADISH: { value: 31, name: "Radish" },
    ONION: { value: 33, name: "Onion" },
    HOPS: { value: 46, name: "Hops" },
    POTATO: { value: 48, name: "Potato" },
    TOMATO: { value: 15, name: "Tomato" },
    LEEK: { value: 50, name: "Leek" },
    WATERMELON: { value: 59, name: "Watermelon" },
    CORN: { value: 63, name: "Corn" },
    CABBAGE: { value: 65, name: "Cabbage" },
    PUMPKIN: { value: 67, name: "Pumpkin" },
    WHEAT: { value: 69, name: "Wheat" },
    GOLD_PEPPER: { value: 157, name: "Gold Pepper" },
    GOLD_CARROT: { value: 159, name: "Gold Carrot" },
    GOLD_PEA: { value: 161, name: "Gold Pea" },
    GOLD_CUCUMBER: { value: 189, name: "Gold Cucumber" },

    /**
     * @param seed Seed object from the constant Seeds
     */
    findGrownCropBySeed: (seed) => {
        for (let growncrop in GrownCrops) {
            if (GrownCrops[growncrop].hasOwnProperty("value") && GrownCrops[growncrop].value == seed.value - 1) return GrownCrops[growncrop];
        }
        return null;
    }
}



//https://farmrpg.com/worker.php?go=fishcaught&id=PLACEVALUE
const FishingPlaces = {
    SMALL_POND: { value: 1, name: "Small Pond" },
    FARM_POND: { value: 2, name: "Farm Pond" },
    FOREST_POND: { value: 3, name: "Forest Pond" },
    LAKE_TEMPEST: { value: 4, name: "Lake Tempest" },
    SMALL_ISLAND: { value: 5, name: "Small Island" },
    CRYSTAL_RIVER: { value: 6, name: "Crystal River" },
    SEVENT_PLACE: { value: 7, name: "Seventh Place" },
    EIGHTH_PLACE: { value: 8, name: "Eighth Place" },
}

//https://farmrpg.com/worker.php?go=explore&id=PLACEVALUE
const ExplorePlaces = {
    SMALL_CAVE: { value: 1, name: "Small Cave" },
    SMALL_SPRING: { value: 2, name: "Small Spring" },
    HIGHLAND_HILLS: { value: 3, name: "Highland Hills" },
    CANE_POLE_RIDGE: { value: 4, name: "Cane Pole Ridge" },
    FIFTH_PLACE: { value: 5, name: "Fifth Place" },
    SIXTH_PLACE: { value: 6, name: "Sixth Place" },
    SEVENT_PLACE: { value: 7, name: "Seventh Place" },
    EIGHTH_PLACE: { value: 8, name: "Eighth Place" },
}