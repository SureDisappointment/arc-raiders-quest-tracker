/**
 * `useQuests` Composable
 *
 * This is the primary state management composable for the application.
 * It is responsible for:
 * - Managing the global set of `completedQuests` using `useState`.
 * - Persisting and hydrating this state to/from `localStorage`.
 * - Combining static layout data (`useGraphLayout`) with dynamic completion state.
 * - Providing "reactive" nodes and edges to the view.
 * - Exposing methods to interact with the quest state (toggle, reset, etc.).
 * - Handling graph traversal logic (complete prerequisites, uncomplete dependants).
 */
import { computed, watch, onMounted } from 'vue'
import type { Quest } from './questData'
import { questTiers } from './questData'
import { useGraphLayout } from './useGraphLayout'

// --- Global Application State (using Nuxt's useState) ---

/**
 * Holds a Set of completed quest IDs.
 * `useState` ensures this state is shared across all components
 * and persists during HMR (Hot Module Replacement).
 */
const useCompletedQuests = () => useState<Set<string>>('completedQuests', () => new Set())

/**
 * A boolean flag to ensure the localStorage hydration logic
 * runs only *once* on the client.
 */
const useInitialized = () => useState<boolean>('questsInitialized', () => false)

/**
 * Global state for the search query string.
 */
const useSearchQuery = () => useState<string>('searchQuery', () => '')

// --- Static Data (Module Scope) ---

/**
 * A Map of all quests, keyed by their ID.
 * This is created once when the module is loaded and provides
 * fast O(1) lookups, which is much more performant than
 * `Array.find()` inside computed properties.
 */
const questMap = new Map<string, Quest>(
  questTiers.flat().map(q => [q.id, q])
)

// --- Composable Function ---

export const useQuests = () => {
  // --- 1. Initialize State & Layout ---

  const completedQuests = useCompletedQuests()
  const isInitialized = useInitialized()
  const searchQuery = useSearchQuery()

  // Get the static, pre-calculated layout data.
  // This data (positions, dimensions) will *not* change.
  const { layoutNodes, layoutEdges, graphWidth, graphHeight } = useGraphLayout()

  // --- 2. Persistence (LocalStorage) ---

  /**
   * On component mount (client-side only), load the saved
   * quest progress from localStorage.
   */
  onMounted(() => {
    // Only run this hydration logic once
    if (isInitialized.value) {
      return
    }
    isInitialized.value = true

    try {
      const stored = localStorage.getItem('arc-raiders-progress')
      if (stored) {
        const parsed = JSON.parse(stored)
        // Basic validation to ensure we're loading an array
        if (Array.isArray(parsed)) {
          completedQuests.value = new Set(parsed)
        }
      }
    } catch (e) {
      console.error('Error loading quest progress on mount:', e)
    }
  })

  /**
   * Watch for changes in `completedQuests` and save the
   * new state to localStorage.
   */
  if (import.meta.client) { // Guard to only run on the client
    watch(completedQuests, (newSet) => {
      const asArray = Array.from(newSet)
      localStorage.setItem('arc-raiders-progress', JSON.stringify(asArray))
    }, { deep: true })
  }

  // --- 3. Public Methods ---

  /**
   * Toggles the completion state of a single quest.
   * @param id The ID of the quest to toggle.
   */
  const toggleQuest = (id: string) => {
    if (completedQuests.value.has(id)) {
      completedQuests.value.delete(id)
    } else {
      completedQuests.value.add(id)
    }
  }

  /**
   * Resets all quest progress.
   */
  const resetProgress = () => {
    completedQuests.value.clear()
  }

  /**
   * Recursively finds all prerequisites for a given quest
   * and marks them as completed.
   * This performs a Depth-First Search (DFS) traversal *up* the graph.
   * @param questId The ID of the quest to "fast-forward" to.
   */
  const completeQuestPrerequisites = (questId: string) => {
    const queue = [questId] // Use a stack (via .pop()) for DFS
    const questsToComplete = new Set<string>()

    while (queue.length > 0) {
      const currentId = queue.pop() // Get next quest
      if (currentId === undefined || questsToComplete.has(currentId)) {
        continue // Skip if undefined or already processed
      }

      questsToComplete.add(currentId)

      // Find this quest in our fast-lookup map
      const quest = questMap.get(currentId)

      // Add all its dependencies (parents) to the stack
      if (quest && quest.dependencies) {
        for (const depId of quest.dependencies) {
          queue.push(depId)
        }
      }
    }

    // We don't want to complete the quest itself, just its parents
    questsToComplete.delete(questId)

    // Merge the newly completed quests with the existing set
    completedQuests.value = questsToComplete.union(completedQuests.value)
  }

  /**
   * Recursively finds all dependants (children) for a given quest
   * and marks them as *incomplete*.
   * This performs a Depth-First Search (DFS) traversal *down* the graph.
   * @param questId The ID of the quest to "rewind" from.
   */
  const uncompleteDependants = (questId: string) => {
    const queue = [questId] // Use a stack for DFS
    const questsToUncomplete = new Set<string>()

    while (queue.length > 0) {
      const currentId = queue.pop()
      if (currentId === undefined || questsToUncomplete.has(currentId)) {
        continue // Skip if undefined or already processed
      }

      questsToUncomplete.add(currentId)

      // Find all quests that have this one as a dependency
      const dependants = Array.from(questMap.values()).filter(q =>
        q.dependencies.includes(currentId)
      )

      // Add all dependants (children) to the stack
      for (const dep of dependants) {
        queue.push(dep.id)
      }
    }

    // Create a new set by removing all quests marked for un-completion
    const newSet = new Set(completedQuests.value)
    completedQuests.value = newSet.difference(questsToUncomplete)
  }

  // --- 4. Helper Functions (Internal) ---

  /**
   * Checks if a quest is "available" (i.e., all its
   * dependencies are met, but it is not yet complete).
   */
  const getQuestAvailability = (quest: Quest): boolean => {
    // If it's already complete, it's not "available"
    if (completedQuests.value.has(quest.id)) {
      return false
    }
    // Check if every parent quest ID is in the completed set
    const depsMet = quest.dependencies.every(depId =>
      completedQuests.value.has(depId)
    )
    return depsMet
  }

  /**
   * Checks if *any* direct or indirect child (dependant)
   * of this quest is completed.
   * This is used to prevent un-toggling a quest, which
   * would break the dependency chain.
   */
  const anyDependantCompleted = (quest: Quest): boolean => {
    // Find all quests that list this quest as a dependency
    const dependants = Array.from(questMap.values()).filter(q =>
      q.dependencies.includes(quest.id)
    )

    // Return true if *any* of those dependants are in the completed set
    return dependants.some(dep =>
      completedQuests.value.has(dep.id)
    )
  }

  // --- 5. Reactive Computed Properties ---

  /**
   * **[Key Computed Property]**
   * This property merges the *static* `layoutNodes` with the
   * *dynamic* `completedQuests` state.
   * It recalculates whenever `completedQuests` changes.
   * This is the final, "reactive" data consumed by `index.vue`.
   */
  // const reactiveNodes = computed(() => {
  //   return layoutNodes.value.map((node) => {
  //     const isCompleted = completedQuests.value.has(node.quest.id)
  //     const isAvailable = getQuestAvailability(node.quest)
  //     const hasDependantsCompleted = anyDependantCompleted(node.quest)

  //     return {
  //       ...node, // Contains { quest, x, y }
  //       isCompleted,
  //       isAvailable,
  //       hasDependantsCompleted
  //     }
  //   })
  // })
  const reactiveNodes = computed(() => {
    return layoutNodes.value.map((node) => {
      const isCompleted = completedQuests.value.has(node.quest.id)
      const isAvailable = getQuestAvailability(node.quest)
      const hasDependantsCompleted = anyDependantCompleted(node.quest)

      return {
        ...node, // Contains { quest, x, y }
        isCompleted,
        isAvailable,
        hasDependantsCompleted
      }
    })
  })

  /**
   * **[Key Computed Property]**
   * Merges the *static* `layoutEdges` with the *dynamic*
   * `completedQuests` state to determine if an edge should be
   * highlighted (i.e., its "from" node is complete).
   */
  const reactiveEdges = computed(() => {
    return layoutEdges.value.map(edge => ({
      ...edge, // Contains { id, fromId, toId, d }
      // An edge is "completed" if its source quest is completed
      completed: completedQuests.value.has(edge.fromId)
    }))
  })

  // --- 6. Return Public API ---
  return {
    // Static layout data (needed for search/focus)
    layoutNodes,
    // Reactive data for rendering
    reactiveNodes,
    reactiveEdges,
    // Graph dimensions
    graphWidth,
    graphHeight,
    // State and methods
    completedQuests,
    toggleQuest,
    resetProgress,
    getQuestAvailability,
    completeQuestPrerequisites,
    anyDependantCompleted,
    uncompleteDependants,
    searchQuery
  }
}
