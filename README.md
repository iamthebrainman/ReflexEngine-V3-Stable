<div align="center">
<img width="1920" height="842" alt="Reflex Engine Banner" src="https://github.com/user-attachments/assets/2f3ecfa6-70b9-4fec-8873-5285407658fb" />
</div>

# ReflexEngine V3

**Research-grade cognitive AI architecture, built for the browser.**

ReflexEngine V3 enables multi-layered AI reasoning with conscious/subconscious thought cycles, semantic memory recall, and self-narrative weaving—all running directly in your browser using Google's Gemini API.

---

## 🧠 Core Features

### Semantic Resonance Graph (SRG)
A **highly compact, graph-based memory system** that models semantic transitions between concepts. The SRG:
- Extracts key concepts from each user and model interaction
- Learns weighted associations between cognitive states (conscious thoughts, subconscious reflections, axioms)
- Predicts follow-up concepts and enriches context for future queries
- Stores and retrieves patterns across sessions using IndexedDB

The SRG acts as the "synaptic network" of Reflex, enabling intelligent memory recall and semantic prediction without external vector databases.

### Cognitive Architecture
Reflex uses a **three-layer processing cycle**:
1. **Conscious Thought**: Initial, direct response to the user's query
2. **Subconscious Reflection**: Deep introspection, critique, and alternative reasoning paths
3. **Final Synthesis**: Integration of both layers into a polished, context-aware answer

Each cycle generates cognitive trace atoms that feed into the SRG and inform future reasoning.

### Arbiter Cycle & Axiom Generation
After each interaction, an **Arbiter** synthesizes insights from the cognitive trace into **axioms**—distilled principles or lessons that capture the essence of the exchange. Over time, these axioms form a growing knowledge base specific to your conversation.

### Core Narrative System
Reflex maintains an **evolving Core Narrative**, woven from insights and axioms generated during Arbiter cycles. This narrative acts as a coherent "self-story" that reflects the AI's accumulated understanding and priorities across all sessions.

### File Handling & Context Control
- **Import project files** and selectively include them in the AI's context
- **Toggle context** for individual files, messages, and user/model turns
- **Diff viewer** for comparing files side-by-side
- **Export generated files** individually or as a zip archive
- **Session state persistence**: Save and load full conversation histories as JSON

### Memory Crystal Visualizer
A **3D force-directed graph visualization** of the AI's internal memory:
- Nodes represent conscious thoughts, subconscious reflections, and axioms
- Links show semantic associations and concept co-activation
- Interactive timeline playback to watch memory formation in real time
- Zoom, pan, and hover to explore the structure of cognition
- <img width="938" height="401" alt="image" src="https://github.com/user-attachments/assets/30b5cdaf-0793-4e38-9931-25b5c4b99add" />


---

## 🚀 Run Locally

**Prerequisites:**  
- Node.js (v18+ recommended)
- A [Google AI API key](https://ai.google.dev)

**Steps:**
1. Clone the repository:
