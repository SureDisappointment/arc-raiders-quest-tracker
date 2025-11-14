/**
 * Node.js Scraping Script
 *
 * This script fetches data from the ARC Raiders Wiki.
 * It runs in two stages:
 * 1. `fetchQuestUrls`: Gets a list of all quest page URLs from the main "Quests" page.
 * 2. `scrapeQuestPage`: Visits each individual quest page to find its
 * prerequisites ("previous") and unlocks ("next").
 *
 * It saves the raw scraped data to `raw/questData.json`.
 *
 * To run: `node getQuestData.js`
 */
import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import fs from 'fs'

/**
 * Fetches all quest page URLs from the main overview page.
 * @returns {Promise<string[]>} A list of full quest URLs.
 */
async function fetchQuestUrls() {
  const overviewUrl = 'https://arcraiders.wiki/wiki/Quests'
  const baseUrl = 'https://arcraiders.wiki'
  const urls = []
  console.log(`Fetching quest list from ${overviewUrl}...`)

  try {
    const response = await fetch(overviewUrl, {
      headers: {
        // Set a User-Agent, as some wikis/sites block default `fetch` agents
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch ${overviewUrl}. Status: ${response.status}`)
    }
    const html = await response.text()
    const $ = cheerio.load(html)

    // This CSS selector targets the first <a> tag inside the first <td> or <th>
    // of any row in a .wikitable. This is brittle and may break if the
    // wiki's HTML structure changes.
    const selector = 'table.wikitable tr > td:first-child a[href^="/wiki/"], table.wikitable tr > th:first-child a[href^="/wiki/"]'

    $(selector).each((i, el) => {
      const href = $(el).attr('href')

      if (href) {
        // Resolve relative URLs (e.g., "/wiki/My_Quest") to absolute URLs
        const fullUrl = new URL(href, baseUrl).toString()
        if (!urls.includes(fullUrl)) {
          urls.push(fullUrl)
        }
      }
    })

    console.log(`Found ${urls.length} links.`)
    return urls
  } catch (error) {
    console.error(`Error fetching quest URL list: ${error.message}`)
    return []
  }
}

/**
 * Parses related quests (dependencies/unlocks) from the infobox table.
 * @param {cheerio.CheerioAPI} $ - The Cheerio instance
 * @param {string} relationClass - The class of the <tr> (e.g., "data-previous" or "data-next")
 * @returns {string[]} A list of quest *titles*
 */
function getRelatedQuests($, relationClass) {
  const quests = []

  // Find the <tr> (e.g., <tr class="data-previous">), then find all <a>
  // tags inside its <td>, and extract their text.
  $(`tr.${relationClass} td a`).each((i, el) => {
    // Check for a 'title' attribute to ensure it's a real quest link
    // and not just a "red link" (page does not exist).
    if ($(el).attr('title')) {
      quests.push($(el).text().trim())
    }
  })
  return quests
}

/**
 * Fetches and parses a single quest page.
 * @param {string} url - The URL of the quest to scrape.
 * @returns {Promise<object | null>} A quest object or null if failed.
 */
async function scrapeQuestPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
      }
    })

    if (!response.ok) {
      console.warn(`Failed to fetch ${url}. Status: ${response.status}`)
      return null
    }
    const html = await response.text()
    const $ = cheerio.load(html)

    // The page title is the quest title
    const title = $('h1#firstHeading').text().trim()
    if (!title) return null // Skip if no title is found

    // Find the "Previous" quest(s) - these are the dependencies
    const previousQuests = getRelatedQuests($, 'data-previous')
    // Find the "Next" quest(s) - these are the unlocks (we call them dependants)
    const nextQuests = getRelatedQuests($, 'data-next')

    return {
      title,
      url,
      dependencies: previousQuests, // Quests that *this* quest depends on
      unlocks: nextQuests // Quests that *this* quest unlocks
    }
  } catch (error) {
    console.error(`Error processing ${url}:`, error.message)
    return null
  }
}

/**
 * Main function to run the script.
 */
async function main() {
  const QUEST_URLS = await fetchQuestUrls()

  if (QUEST_URLS.length === 0) {
    console.error('No quest URLs found. Aborting script.')
    return
  }

  process.stdout.write(`Processing pages...`)

  const allQuestData = {}
  let count = 0

  for (const url of QUEST_URLS) {
    // **IMPORTANT**: Add a small delay between requests to be polite
    // to the wiki's server and avoid getting IP-banned.
    await new Promise(resolve => setTimeout(resolve, 50)) // 50ms delay

    const quest = await scrapeQuestPage(url)
    if (quest) {
      // Store data in a map keyed by title for easy lookup
      allQuestData[quest.title] = {
        url: quest.url,
        dependencies: quest.dependencies,
        unlocks: quest.unlocks
      }
      count++
      process.stdout.write(`\rProcessing pages... ${count}/${QUEST_URLS.length}`)
    }
  }
  process.stdout.write('\n')

  const outputPath = './raw/questData.json'
  fs.mkdirSync('./raw', { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(allQuestData, null, 2))

  console.log(`Quest data has been saved to: ${outputPath}`)
}

// Run the script
main()
