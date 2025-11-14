/**
 * Node.js Tier Generation Script
 *
 * This script processes the raw `questData.json` file (from `getQuestData.js`)
 * and transforms it into a clean, tiered, and ID-based structure
 * usable by the Nuxt application.
 *
 * It performs three main steps:
 * 1. **Pre-processing**: Converts quest titles into unique IDs (slugs) and
 * re-maps all `dependencies` (which are titles) to use the new IDs.
 * 2. **Topological Sort**: Organizes all quests into "tiers" based on their
 * dependencies. Tier 0 has no dependencies, Tier 1 depends on Tier 0, etc.
 * This is essential for the `dagre` layout engine.
 * 3. **Code Generation**: Writes the final, sorted data to
 * `./app/composables/questData.ts` as a TypeScript file.
 *
 * To run: `node generateTiers.js` (must be run *after* `getQuestData.js`)
 */
import fs from 'fs'

/**
 * Generates a simple, unique ID (slug) from a quest title.
 * Example: "A Bad Feeling" -> "a_bad_feeling"
 * Example: "Bees!" -> "bees"
 * @param {string} title
 * @returns {string}
 */
function generateId(title) {
  return title
    .toLowerCase()
    .replace(/'/g, '') // Remove apostrophes
    .replace(/[^a-z0-9 ]/g, '') // Remove non-alphanumeric/spaces
    .trim()
    .replace(/\s+/g, '_') // Replace spaces with underscores
}

/**
 * The main function to process the quest data and generate tiers.
 */
function main() {
  console.log('Reading questData.json...')
  let rawData
  try {
    rawData = fs.readFileSync('./raw/questData.json', 'utf-8')
  } catch (e) {
    console.error('Error: questData.json not found. Please run "node getQuestData.js" first.', e)
    return
  }

  const questMap = JSON.parse(rawData)
  const questTitles = Object.keys(questMap)

  // --- Step 1: Pre-processing (Titles to IDs) ---
  // The scraped data uses titles for dependencies, but we need
  // stable IDs for our application state.

  const titleToIdMap = new Map() // Map<string, string> (Title -> ID)
  const allQuests = new Map() // Map<string, Quest> (ID -> Quest Object)

  // First pass: Create IDs for all quests and populate titleToIdMap
  for (const title of questTitles) {
    const id = generateId(title)
    if (titleToIdMap.has(title)) {
      console.warn(`Duplicate title found (will be overwritten): ${title}`)
    }
    titleToIdMap.set(title, id)
  }

  // Second pass: Build the final Quest objects, using the map to
  // convert dependency *titles* into dependency *IDs*.
  for (const title of questTitles) {
    const id = titleToIdMap.get(title)
    const questData = questMap[title]

    // Convert dependency titles into dependency IDs
    const dependencyIds = questData.dependencies
      .map(depTitle => titleToIdMap.get(depTitle)) // Find the ID for each title
      .filter(Boolean) // Filter out any (falsy) undefineds/nulls

    allQuests.set(id, {
      id,
      title,
      url: questData.url,
      dependencies: dependencyIds
    })
  }

  // --- Step 2: Topological Sort (Tier Generation) ---
  // We iteratively find all quests whose dependencies have already
  // been processed. This places them into "tiers".

  console.log('Sorting quests into tiers...')
  const questTiers = [] // This will be our final Quest[][] array
  const processedQuestIds = new Set() // Quests already placed in a tier

  // Convert map to an array for easier filtering
  let remainingQuests = Array.from(allQuests.values())

  while (remainingQuests.length > 0) {
    const currentTier = []
    const questsForNextRound = []

    // Find all quests that can be added in this tier
    for (const quest of remainingQuests) {
      // Check if all dependencies for *this* quest are in the processed set
      const depsMet = quest.dependencies.every(depId => processedQuestIds.has(depId))

      if (depsMet) {
        // All dependencies are met, add to this tier
        currentTier.push(quest)
      } else {
        // Not ready yet, add to the pool for the next round
        questsForNextRound.push(quest)
      }
    }

    // **Safety Check for Circular Dependencies**
    // If we found no quests for the current tier, but there are
    // still quests remaining, it means we have a cycle.
    if (currentTier.length === 0 && questsForNextRound.length > 0) {
      console.error('Error: Circular dependency detected!')
      console.error('The following quests could not be sorted:')
      questsForNextRound.forEach(q => console.log(`- ${q.title} (Dependencies: ${q.dependencies.join(', ')})`))
      return // Abort the script
    }

    // Add the found tier to our list
    questTiers.push(currentTier)

    // Add all quests from this tier to the processed set for the next loop
    currentTier.forEach(quest => processedQuestIds.add(quest.id))

    // The next loop will only process the quests that are left
    remainingQuests = questsForNextRound
  }

  console.log(`Sorted ${allQuests.size} quests into ${questTiers.length} tiers.`)

  // --- Step 3: Generate the TypeScript File ---

  const outputPath = './app/composables/questData.ts'

  // Format the questTiers array into a JSON string with indentation
  const questTiersJson = JSON.stringify(questTiers, null, 2)

  // Create the file content using a template literal
  const fileContent = `/* eslint-disable @stylistic/quote-props */
/* eslint-disable @stylistic/quotes */
// This file is auto-generated by generateTiers.js
// Do not edit this file directly.

// 1. Define the interface for a Quest
export interface Quest {
  id: string
  title: string
  url: string
  dependencies: string[] // Array of quest IDs
}

// 2. Export the auto-sorted quest tiers
export const questTiers: Quest[][] = ${questTiersJson}
`

  // Write the file to the composables directory
  fs.writeFileSync(outputPath, fileContent)
  console.log(`Successfully generated: ${outputPath}`)
}

// Run the script
main()
