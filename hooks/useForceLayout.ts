

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MemoryAtom } from '../types';

// Augment MemoryAtom with position and velocity for simulation
// FIX: Renamed `Node` to `GraphNode` to avoid collision with the global DOM `Node` type.
export interface GraphNode extends MemoryAtom {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Link {
    source: string; // uuid of source node
    target: string; // uuid of target node
    strength: number; // number of shared concepts
}

export interface SemanticZone {
    region: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
    x: number;
    y: number;
    concepts: string[];
}

// Export constants for use in visualization component
export const MIN_RADIUS = 8;
export const MAX_RADIUS = 30;

// New simulation config for semantic clustering and perpetual motion
const SIMULATION_CONFIG = {
  repulsion: 3500,          // Force pushing all nodes apart.
  typeRepulsionMultiplier: 1.5, // Extra push between different types of nodes.
  attraction: 0.015,        // Slightly weaker attraction to allow regions to form.
  linkDistance: 120,        // Ideal distance between linked nodes.
  damping: 0.9,             // Friction.
  ambientJiggle: 0,         // Constant force to keep it alive.
  boundaryForce: 0.1,       // Strength of the 'soft wall' at the edges.
  boundaryPadding: 50,      // Distance from edge where boundary force starts.
};

// FIX: Refactored function to programmatically create zones and ensure correct type inference for the 'region' property.
const calculateSemanticZones = (nodes: GraphNode[], width: number, height: number): SemanticZone[] => {
    if (nodes.length < 10) return [];
    const zones: Record<SemanticZone['region'], { concepts: Map<string, number> }> = {
        topLeft: { concepts: new Map() },
        topRight: { concepts: new Map() },
        bottomLeft: { concepts: new Map() },
        bottomRight: { concepts: new Map() },
    };
    const midX = width / 2;
    const midY = height / 2;

    for (const node of nodes) {
        if (!node.concepts) continue;
        const region: SemanticZone['region'] = node.y < midY
            ? (node.x < midX ? 'topLeft' : 'topRight')
            : (node.x < midX ? 'bottomLeft' : 'bottomRight');
        
        for (const concept of node.concepts) {
            const currentCount = zones[region].concepts.get(concept) || 0;
            zones[region].concepts.set(concept, currentCount + 1);
        }
    }
    
    const zonePositions: Record<SemanticZone['region'], { x: number; y: number }> = {
        topLeft: { x: width * 0.25, y: height * 0.25 },
        topRight: { x: width * 0.75, y: height * 0.25 },
        bottomLeft: { x: width * 0.25, y: height * 0.75 },
        bottomRight: { x: width * 0.75, y: height * 0.75 },
    };

    return (Object.keys(zones) as Array<SemanticZone['region']>)
        .map(region => ({
            region,
            x: zonePositions[region].x,
            y: zonePositions[region].y,
            concepts: [...zones[region].concepts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(e => e[0]),
        }))
        .filter(zone => zone.concepts.length > 0);
};


export const useForceLayout = (atoms: MemoryAtom[], width: number, height: number, isActive: boolean) => {
  // FIX: Use renamed `GraphNode` type.
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<Link[]>([]);
  // FIX: Use renamed `GraphNode` type.
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [semanticZones, setSemanticZones] = useState<SemanticZone[]>([]);
  const animationFrameRef = useRef<number>();
  const zoneUpdateCounterRef = useRef(0);


  // Initialize nodes and calculate links
  useEffect(() => {
    // FIX: Use renamed `GraphNode` type.
    const existingNodesMap = new Map<string, GraphNode>(nodesRef.current.map(n => [n.uuid, n]));
    const newNodes = atoms.map((atom): GraphNode => {
      const existing = existingNodesMap.get(atom.uuid);
      if (existing) {
        // Carry over existing atom but update its content if needed
        return { ...existing, ...atom };
      }
      return {
        ...atom,
        x: width / 2 + (Math.random() - 0.5) * 50,
        y: height / 2 + (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      };
    });
    
    const atomUuids = new Set(atoms.map(a => a.uuid));
    const filteredNodes = newNodes.filter(n => atomUuids.has(n.uuid));

    // Pre-calculate links based on shared concepts
    const newLinks: Link[] = [];
    for (let i = 0; i < filteredNodes.length; i++) {
        for (let j = i + 1; j < filteredNodes.length; j++) {
            const source = filteredNodes[i];
            const target = filteredNodes[j];
            if (!source.concepts || !target.concepts) continue;

            // FIX: The original .includes() call was causing an error. Replaced with a more robust and performant Set-based approach to find shared concepts.
            const targetConceptsSet = new Set(target.concepts);
            const sharedConcepts = source.concepts.filter(c => targetConceptsSet.has(c));
            if (sharedConcepts.length > 0) {
                newLinks.push({
                    source: source.uuid,
                    target: target.uuid,
                    strength: sharedConcepts.length,
                });
            }
        }
    }

    nodesRef.current = filteredNodes;
    linksRef.current = newLinks;
    setNodes(filteredNodes); // Initial render
    setLinks(newLinks);
  }, [atoms, width, height]);

  // This function performs a single step of the physics simulation.
  // It does NOT perpetuate the animation loop itself.
  const simulationTick = useCallback(() => {
    if (!width || !height || nodesRef.current.length === 0) {
        return;
    };
    
    const { repulsion, typeRepulsionMultiplier, attraction, linkDistance, damping, ambientJiggle, boundaryForce, boundaryPadding } = SIMULATION_CONFIG;
    
    let currentNodes = nodesRef.current;
    // FIX: Use renamed `GraphNode` type.
    const nodeMap: Map<string, GraphNode> = new Map(currentNodes.map(n => [n.uuid, n]));

    // 1. Apply link-based attraction
    for (const link of linksRef.current) {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const dynamicLinkDistance = linkDistance / link.strength;
        const force = attraction * (distance - dynamicLinkDistance) * link.strength;
        
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
    }

    // 2. Apply repulsion and update positions
    for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];
        
        for (let j = i + 1; j < currentNodes.length; j++) {
            const other = currentNodes[j];
            const dx = node.x - other.x;
            const dy = node.y - other.y;
            let distanceSq = dx * dx + dy * dy;
            if (distanceSq < 100) distanceSq = 100;

            let typeMultiplier = 1.0;
            if (node.type !== other.type) {
                typeMultiplier = typeRepulsionMultiplier;
            }
            
            const force = (repulsion / distanceSq) * typeMultiplier;
            const fx = (dx / Math.sqrt(distanceSq)) * force;
            const fy = (dy / Math.sqrt(distanceSq)) * force;

            node.vx += fx;
            node.vy += fy;
            other.vx -= fx;
            other.vy -= fy;
        }

        // Soft boundary forces
        if (node.x < boundaryPadding) node.vx += (boundaryPadding - node.x) * boundaryForce;
        if (node.x > width - boundaryPadding) node.vx -= (node.x - (width - boundaryPadding)) * boundaryForce;
        if (node.y < boundaryPadding) node.vy += (boundaryPadding - node.y) * boundaryForce;
        if (node.y > height - boundaryPadding) node.vy -= (node.y - (height - boundaryPadding)) * boundaryForce;
    }

    // 3. Update node positions based on velocity
    currentNodes = currentNodes.map(node => {
      let { x, y, vx, vy } = node;
      vx = vx * damping + (Math.random() - 0.5) * ambientJiggle;
      vy = vy * damping + (Math.random() - 0.5) * ambientJiggle;
      x += vx;
      y += vy;
      return { ...node, x, y, vx, vy };
    });

    nodesRef.current = currentNodes;
    setNodes(currentNodes);
    
    // Update semantic zones periodically to save performance
    zoneUpdateCounterRef.current++;
    if (zoneUpdateCounterRef.current % 15 === 0) {
        setSemanticZones(calculateSemanticZones(currentNodes, width, height));
    }
  }, [width, height]);

  // This effect now explicitly controls the animation loop.
  useEffect(() => {
    const loop = () => {
      simulationTick();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    // Only start the loop if the component is active and has dimensions.
    if (isActive && width > 0 && height > 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
    }
    
    // The cleanup function is now guaranteed to stop the loop because
    // the loop cannot restart itself.
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [isActive, simulationTick, width, height]);

  return { nodes, links, semanticZones };
};
