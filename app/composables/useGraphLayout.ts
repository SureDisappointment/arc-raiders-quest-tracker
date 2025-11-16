/**
 * `useGraphLayout` Composable
 *
 * This composable is responsible for calculating the visual layout
 * of the quest graph *one time*. It uses the `dagre` library
 * to perform a hierarchical graph layout (top-down).
 *
 * Its key responsibility is to take the abstract quest data
 * (nodes and dependencies) and output concrete X/Y coordinates
 * and SVG path data for rendering.
 *
 * This entire calculation is wrapped in a `computed` property,
 * so it runs only once and the result is cached.
 */
import { computed } from 'vue'
import * as dagre from 'dagre'
import { questTiers, type Quest } from './questData'

// --- 1. Layout Constants ---
// These constants *must* be kept in sync with the styling
// in `QuestNode.vue` (e.g., w-64 = 256px).

/**
 * The fixed width of a quest node in pixels.
 * (Tailwind `w-64` = 16rem = 256px)
 */
export const NODE_WIDTH = 256
/**
 * The fixed height of a quest node in pixels.
 * (Tailwind `p-4` = 1rem*2 = 32px) + (line-height ~22px) = 54px
 */
export const NODE_HEIGHT = 54
/**
 * Horizontal spacing between nodes.
 */
const X_PADDING = 50
/**
 * Vertical spacing between graph "ranks" or "tiers".
 */
const Y_PADDING = 64
/**
 * Margin around the entire graph.
 */
const X_MARGIN = 10
const Y_MARGIN = 10

// --- 2. Interfaces ---

/**
 * The final layout object for a single node,
 * containing its quest data and calculated coordinates.
 */
export interface LayoutNode {
  quest: Quest
  x: number // Top-left X coordinate
  y: number // Top-left Y coordinate
}

/**
 * The final layout object for a single edge (line).
 */
export interface LayoutEdge {
  id: string
  fromId: string // ID of the parent quest
  toId: string // ID of the child quest
  d: string // The SVG path data (e.g., "M 10 10 C...")
}

// --- 3. Composable Function ---

export const useGraphLayout = () => {
  /**
   * This is the core of the composable.
   * It's a `computed` property that runs the entire Dagre layout
   * algorithm once and caches the result.
   */
  const layout = computed(() => {
    // --- 2. Create and configure the Dagre graph ---
    const g = new dagre.graphlib.Graph()

    // Set graph-wide options
    g.setGraph({
      rankdir: 'TB', // Layout from Top-to-Bottom
      ranksep: Y_PADDING, // Vertical spacing
      nodesep: X_PADDING, // Horizontal spacing
      edgesep: 200, // Minimum spacing between edges
      marginx: X_MARGIN,
      marginy: Y_MARGIN,
      ranker: 'network-simplex' // The layout algorithm
    })

    // Default edge/node style (Dagre requires this)
    g.setDefaultEdgeLabel(() => ({}))
    g.setDefaultNodeLabel(() => ({}))

    // --- 3. Add all nodes and edges to the Dagre graph ---
    const allQuests = questTiers.flat()

    // Add nodes to the graph
    for (const quest of allQuests) {
      g.setNode(quest.id, {
        label: quest.title,
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      })
    }

    // Add edges (dependencies) to the graph
    for (const quest of allQuests) {
      for (const depId of quest.dependencies) {
        // Ensure the parent quest exists before adding an edge
        if (g.hasNode(depId)) {
          // Dagre edges go from PARENT -> CHILD
          g.setEdge(depId, quest.id)
        }
      }
    }

    // --- 4. Run the layout algorithm! ---
    // This is the "magic" step where Dagre calculates
    // all the X/Y positions.
    dagre.layout(g)

    // --- 5. Extract the node results from Dagre ---
    const nodes: LayoutNode[] = []
    const nodeMap = new Map<string, dagre.Node>()

    g.nodes().forEach((id) => {
      const node = g.node(id)
      if (!node) return

      // Store the Dagre node in a map for easy edge creation
      nodeMap.set(id, node)

      // **CRITICAL ADJUSTMENT**:
      // Dagre provides coordinates for the *center* of the node.
      // HTML/CSS uses coordinates for the *top-left corner*.
      // We must subtract half the width/height to correct this.
      nodes.push({
        quest: allQuests.find(q => q.id === id)!,
        x: node.x - (NODE_WIDTH / 2),
        y: node.y - (NODE_HEIGHT / 2)
      })
    })

    // --- 6. Generate Edge Path Data ---
    const edges: LayoutEdge[] = []

    // Loop through our original quest data to build edges
    for (const quest of allQuests) {
      for (const depId of quest.dependencies) {
        const parent = nodeMap.get(depId)
        const node = nodeMap.get(quest.id)

        if (parent && node) {
          // --- Calculate SVG path for a smooth S-curve ---

          // (x1, y1) = Exit point (bottom-center of parent node)
          const x1 = parent.x
          const y1 = parent.y + (NODE_HEIGHT / 2)

          // (x2, y2) = Entry point (top-center of child node)
          const x2 = node.x
          const y2 = node.y - (NODE_HEIGHT / 2)

          // (cpx1, cpy1) = Bezier control point for exit
          // (cpx2, cpy2) = Bezier control point for entry
          // This creates a vertical S-shape
          const cpx1 = x1
          const cpy1 = (y1 + y2) / 2
          const cpx2 = x2
          const cpy2 = (y1 + y2) / 2

          // `d` is the string for the SVG <path> element:
          // "M x1 y1"   = Move to start point
          // "C cpx1 cpy1, cpx2 cpy2, x2 y2" = Cubic Bezier curve to end point
          const d = `M ${x1} ${y1} C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${x2} ${y2}`

          edges.push({
            id: `${depId}-${quest.id}`,
            fromId: depId,
            toId: quest.id,
            d // The calculated SVG path string
          })
        }
      }
    }

    // Get final graph dimensions from Dagre
    const graphInfo = g.graph()
    const graphWidth = graphInfo.width ?? 1000
    const graphHeight = graphInfo.height ?? 1000

    // Return the processed, static layout
    return { nodes, edges, width: graphWidth, height: graphHeight }
  })

  // Expose the cached layout data via computed getters
  return {
    layoutNodes: computed(() => layout.value.nodes),
    layoutEdges: computed(() => layout.value.edges),
    graphWidth: computed(() => layout.value.width),
    graphHeight: computed(() => layout.value.height)
  }
}
