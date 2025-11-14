<script setup lang="ts">
/**
 * QuestNode component
 *
 * This component represents a single, interactive quest "card"
 * in the graph. It handles its own visual state (completed,
 * available, disabled) and emits events for user actions
 * (toggle, fast-forward, rewind).
 */

import { computed } from 'vue'

// Disable attribute inheritance. This prevents `class` and `style`
// from being applied to the root <UContextMenu> component.
// Instead, we'll manually apply them to the inner <div> using `v-bind="$attrs"`.
defineOptions({ inheritAttrs: false })

// --- 1. Props ---
const props = defineProps({
  /** The title of the quest */
  title: { type: String, required: true },
  /** The full URL to the quest's wiki page */
  wikiUrl: { type: String, required: false },
  /** The unique ID of the quest */
  questId: { type: String, required: true },
  /** Whether the user has marked this quest as completed */
  completed: { type: Boolean, default: false },
  /** Whether all prerequisites for this quest are met */
  available: { type: Boolean, default: false },
  /** Whether any *child* quests (dependants) are completed */
  dependantsCompleted: { type: Boolean, default: false },
  /** The current search query from the parent */
  searchQuery: { type: String, default: '' }
})

// --- 2. Emits ---
const emit = defineEmits([
  /** Emitted when the node is clicked to toggle completion */
  'toggle',
  /** Emitted from context menu to complete all prerequisites */
  'complete-prerequisites',
  /** Emitted from context menu to un-complete all dependants */
  'uncomplete-dependants'
])

// --- 3. Computed Properties ---

/**
 * A `v-model` proxy for the checkbox.
 * - `get`: Returns the `completed` prop.
 * - `set`: Emits the `toggle` event with the quest ID, instead of
 * mutating the prop directly (which is an anti-pattern).
 */
const model = computed({
  get: () => props.completed,
  set: _val => emit('toggle', props.questId)
})

/**
 * A quest is "disabled" if it's not completed AND not available.
 * (i.e., its prerequisites are not met).
 */
const isDisabled = computed(() => !props.completed && !props.available)

/** True if a search is currently active (query is not empty) */
const searchActive = computed(() => props.searchQuery.trim().length > 0)
/** True if this node's title matches the search query */
const isSearched = computed(() => {
  return props.title.toLowerCase().includes(props.searchQuery.toLowerCase())
})

/**
 * Dynamically generates the items for the context menu (right-click)
 * and the dropdown (kebab) menu.
 *
 * It uses a clever trick:
 * 1. Create an array of potential menu items (some may be `undefined`).
 * 2. Map over the outer array.
 * 3. `filter(item => item !== undefined)` to remove any falsy entries.
 * This results in a clean array of just the valid menu items.
 */
const menuItems = computed(() => [[
  // "Fast-forward" option: Only show if the quest is disabled
  isDisabled.value
    ? {
        label: 'Fast-forward here',
        icon: 'i-heroicons-forward',
        // Emits event to complete all parents
        onSelect: () => emit('complete-prerequisites', props.questId)
      }
    : undefined,
  // "Rewind" option: Only show if dependants are completed
  props.dependantsCompleted
    ? {
        label: 'Rewind here',
        icon: 'i-heroicons-backward',
        // Emits event to un-complete all children
        onSelect: () => emit('uncomplete-dependants', props.questId)
      }
    : undefined,
  // "View on Wiki" option: Only show if a URL is provided
  props.wikiUrl
    ? {
        label: 'View on arcraiders.wiki',
        icon: 'i-heroicons-book-open',
        to: props.wikiUrl,
        target: '_blank'
      }
    : undefined
]].map(group => group.filter(item => item !== undefined))) // Clean up undefined items

/** Checks if there are any valid menu items to show */
const hasMenuItems = computed(() => menuItems.value.flat().length > 0)
</script>

<template>
  <UContextMenu :items="menuItems">
    <div
      v-bind="$attrs"
      class="p-4 rounded-lg shadow-md border w-64 transition-all duration-300"
      :class="{
        // Completed state
        'bg-green-600 text-white border-green-700': completed,
        // Default state
        'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700': !completed,
        // Available (unlocked) state
        'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900': available,
        // Disabled (locked) state
        'opacity-80 grayscale-50': isDisabled,
        // Cursor styles for usability
        'cursor-pointer!': !isDisabled && !dependantsCompleted, // Normal click
        'cursor-help!': isDisabled || dependantsCompleted, // Click is blocked
        // Search state (dims non-matches)
        'opacity-20! grayscale-50!': !isSearched && searchActive
      }"
      @click.prevent.stop="!isDisabled && !dependantsCompleted && (model = !model)"
    >
      <div class="flex items-center justify-between space-x-2">
        <UCheckbox
          v-model="model"
          class="pointer-events-none"
          :disabled="isDisabled"
          :label="title"
          :ui="{ label: 'font-medium' }"
        />

        <UDropdownMenu
          v-if="hasMenuItems"
          :items="menuItems"
          :popper="{ placement: 'bottom-end' }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-ellipsis-vertical"
            class="-my-2 -mr-2"
            @click.stop
          />
        </UDropdownMenu>
      </div>
    </div>
  </UContextMenu>
</template>
