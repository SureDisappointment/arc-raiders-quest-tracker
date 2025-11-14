<script setup lang="ts">
/**
 * Main page component (pages/index.vue)
 *
 * This component displays the interactive quest graph.
 * It's responsible for:
 * 1. Fetching quest data via the `useQuests` composable.
 * 2. Handling all user interactions for panning and zooming the graph.
 * 3. Rendering the quest nodes (`<QuestNode>`) and edges (`<svg>`).
 * 4. Implementing the search and focus logic.
 */

import { ref, watch } from 'vue'
import { useQuests } from '~/composables/useQuests'
import { type LayoutNode, NODE_HEIGHT, NODE_WIDTH } from '~/composables/useGraphLayout'

// --- 1. State from Composables ---

// Destructure all reactive state and methods from the main quest composable.
const {
  layoutNodes, // Static layout data (for search)
  reactiveNodes, // Dynamic nodes with completion state
  reactiveEdges, // Dynamic edges with completion state
  graphWidth, // Total width of the graph canvas
  graphHeight, // Total height of the graph canvas
  toggleQuest, // Function to mark a quest as complete/incomplete
  resetProgress, // Function to clear all progress
  completeQuestPrerequisites, // Function to complete all parent quests
  uncompleteDependants, // Function to un-complete all child quests
  searchQuery // Reactive string for the search input
} = useQuests()

// --- 2. Pan & Zoom View State ---

// The 'view' object tracks the current translation (pan) and scale (zoom)
// of the canvas within the container.
const view = {
  x: 0,
  y: 0,
  scale: 1
}
const MIN_SCALE = 0.2
const MAX_SCALE = 3

// Template refs to the container (viewport) and canvas (movable area)
const container = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)

// State for tracking mouse panning
const isPanning = ref(false)
let panStart = { x: 0, y: 0, viewX: 0, viewY: 0 }

// --- 3. Pan & Zoom Event Handlers ---

/**
 * Handles the 'mousedown' event to initiate panning.
 * Only triggers on left-click (e.button === 0).
 */
function onPanStart(e: MouseEvent) {
  e.preventDefault()
  if (e.button !== 0) return // Ignore right-clicks

  isPanning.value = true
  // Store the initial mouse position and the view's position *at that moment*
  panStart = {
    x: e.clientX,
    y: e.clientY,
    viewX: view.x,
    viewY: view.y
  }
}

/**
 * Handles the 'mousemove' event to update the pan.
 * Only runs if `isPanning` is true.
 */
function onPanMove(e: MouseEvent) {
  e.preventDefault()
  if (!isPanning.value || !canvas.value) return

  // Calculate the distance the mouse has moved
  const dx = e.clientX - panStart.x
  const dy = e.clientY - panStart.y

  // Update the view's position by adding the delta to the *starting* position
  view.x = panStart.viewX + dx
  view.y = panStart.viewY + dy

  // Apply the new transform directly to the canvas element
  canvas.value.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
}

/**
 * Handles 'mouseup' and 'mouseleave' events to stop panning.
 */
function onPanEnd() {
  isPanning.value = false
}

/**
 * Handles the 'wheel' event for zooming.
 * This logic implements "zoom to cursor" by adjusting the
 * pan (view.x, view.y) to counteract the scale change,
 * keeping the content under the cursor stationary.
 */
function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!container.value || !canvas.value) return

  const scale = view.scale
  const delta = e.deltaY > 0 ? -0.1 : 0.1 // -0.1 for zoom out, +0.1 for zoom in

  // Clamp the new scale value between min and max
  let newScale = scale * (1 + delta)
  newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale))

  // --- Zoom-to-Cursor Logic ---
  const containerRect = container.value.getBoundingClientRect()
  // 1. Get mouse position *relative to the container*
  const mouseX = e.clientX - containerRect.left
  const mouseY = e.clientY - containerRect.top

  // 2. Calculate where the mouse is pointing *on the canvas* (pre-zoom)
  const mouseOnCanvasX = (mouseX - view.x) / scale
  const mouseOnCanvasY = (mouseY - view.y) / scale

  // 3. Calculate the new view.x/y. We want the `mouseOnCanvasX/Y`
  //    point to end up at the *same* `mouseX/Y` position post-zoom.
  //    (mouseX = newViewX + mouseOnCanvasX * newScale)
  //    ...so...
  //    (newViewX = mouseX - mouseOnCanvasX * newScale)
  view.x = mouseX - (mouseOnCanvasX * newScale)
  view.y = mouseY - (mouseOnCanvasY * newScale)
  view.scale = newScale

  // Apply the new transform
  canvas.value.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
}

// --- 4. Utility Functions ---

/**
 * Programmatically pans and zooms the view to focus on a specific node.
 * @param node The LayoutNode object to center on.
 * @param scale The desired zoom level to set (default 1.0).
 */
function focusOnNode(node: LayoutNode, scale = 1.0) {
  if (!container.value || !canvas.value) return

  view.scale = scale

  // Get the center of the container (viewport)
  const containerCenterX = container.value.clientWidth / 2
  const containerCenterY = container.value.clientHeight / 2

  // Get the center of the target node (in canvas coordinates)
  const nodeCenterX = node.x + (NODE_WIDTH / 2)
  const nodeCenterY = node.y + (NODE_HEIGHT / 2)

  // Calculate the new view.x/y to center the node.
  // We want: containerCenterX = newViewX + (nodeCenterX * scale)
  // ...so...
  // newViewX = containerCenterX - (nodeCenterX * scale)
  view.x = containerCenterX - (nodeCenterX * scale)
  view.y = containerCenterY - (nodeCenterY * scale)

  // Apply the new transform
  canvas.value.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
}

/**
 * Watcher for the search query.
 * If the search results in exactly one match, focus on that node.
 */
watch(searchQuery, (newQuery) => {
  if (!newQuery) {
    return // Do nothing if search is cleared
  }

  const query = newQuery.toLowerCase()
  // Find matches from the static layoutNodes (no need for reactive data here)
  const matches = layoutNodes.value.filter(node =>
    node.quest.title.toLowerCase().includes(query)
  )

  if (matches.length === 1) {
    focusOnNode(matches[0]!)
  }
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="absolute bottom-0 right-0 mb-2 mr-2 flex space-x-2 z-50">
      <UInput
        v-model="searchQuery"
        icon="i-heroicons-magnifying-glass"
        size="lg"
        placeholder="Search for a quest..."
      >
        <template
          v-if="searchQuery"
          #trailing
        >
          <UButton
            color="neutral"
            variant="link"
            icon="i-heroicons-x-mark"
            :padded="false"
            @click="searchQuery = ''"
          />
        </template>
      </UInput>

      <UButton
        label="Reset Progress"
        color="error"
        variant="solid"
        icon="i-heroicons-arrow-path"
        @click="resetProgress"
      />
    </div>

    <ClientOnly>
      <div
        ref="container"
        class="relative overflow-hidden w-full flex-1 min-h-0"
        :style="{
          cursor: isPanning ? 'grabbing' : 'grab'
        }"
        @mousedown.stop="onPanStart"
        @mousemove.stop="onPanMove"
        @mouseup.stop="onPanEnd"
        @mouseleave.stop="onPanEnd"
        @wheel.prevent.stop="onWheel"
      >
        <div
          ref="canvas"
          class="absolute origin-top-left"
          :style="{
            width: graphWidth + 'px',
            height: graphHeight + 'px'
          }"
        >
          <svg
            class="absolute top-0 left-0"
            :width="graphWidth"
            :height="graphHeight"
          >
            <path
              v-for="edge in reactiveEdges"
              :key="edge.id"
              :d="edge.d"
              stroke-width="2"
              fill="none"
              :class="edge.completed ? 'stroke-blue-500' : 'stroke-gray-300 dark:stroke-gray-700'"
            />
          </svg>

          <QuestNode
            v-for="node in reactiveNodes"
            :key="node.quest.id"
            :title="node.quest.title"
            :wiki-url="node.quest.url"
            :quest-id="node.quest.id"
            :completed="node.isCompleted"
            :available="node.isAvailable"
            :dependants-completed="node.hasDependantsCompleted"
            :search-query="searchQuery"
            class="absolute"
            :style="{ top: node.y + 'px', left: node.x + 'px' }"
            @toggle="toggleQuest"
            @complete-prerequisites="completeQuestPrerequisites"
            @uncomplete-dependants="uncompleteDependants"
          />
        </div>
      </div>
    </ClientOnly>
  </div>
</template>
