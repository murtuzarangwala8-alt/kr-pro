# Academic Organization Ontology & Interactive Visualizer

This repository contains the semantic web OWL ontology representing a university organization, a comprehensive PDF analysis report, and a web-based interactive visualizer to explore the structural model and its instances.

---

## 👥 Metadata
* **Author**: Murtuza Yusuf Rangwala
* **Matricola (Student ID)**: VR50566
* **Professor**: Matteo Cristani
* **Institution**: University of Verona
* **Course**: Knowledge Representation (KR)

---

## 📁 Repository Structure

*   **`AcademicOrganization.owl`**: The Web Ontology Language (OWL-DL) file containing the classes, properties, disjointness constraints, and 81 populated individuals.
*   **`AcademicOrganization_Report.pdf`**: A professional, multi-page PDF report documenting the ontology's architecture, class taxonomy, properties, individual relationships, and design recommendations.
*   **`index.html`**, **`style.css`**, **`app.js`**: The assets for the interactive knowledge graph web visualizer.
*   **`README.md`**: Project documentation.

---

## 🏛️ Ontology Architecture

The ontology is modeled under the root class `AcademicConcept` and spans several key sub-hierarchies:

1.  **Person Taxonomy**:
    *   *Student*: Undergraduate, Graduate (Masters, PhD), Exchange, Part-Time, Full-Time, International, Distance Learning.
    *   *AcademicStaff*: Professor (Assistant, Associate, Full, Emeritus), Lecturer, Researcher, Teaching Assistant, Adjunct, Visiting Scholar.
    *   *AdministrativeStaff*: Rector, Dean, Department Head, Secretary, Library Staff, IT Staff.
    *   *Alumni*: Bachelor, Masters, PhD.
2.  **Organizational Units**:
    *   *University* (Public, Private, Technical, Research), *Faculty*, *Department*, *Research Center* (AI, Biomed, Climate), *Institute*, *Graduate School*, *Library*.
3.  **Academic Programs**:
    *   Degree Programs (Bachelor, Masters, Doctoral), Certificates, Diplomas, Online Programs.
4.  **Courses**:
    *   Core, Elective, Undergraduate, Graduate, Seminar, Workshop, Lab, Thesis.
5.  **Facilities**:
    *   Building (Academic, Residence), Classroom (Lecture Hall, Auditorium), Laboratories (Computer, Scientific, Wet, Dry).
6.  **Research Activity**:
    *   Projects (Funded, Internal, Collaborative), Publications (Journal, Conference, Preprint, Book Chapter), Grants (Government, Private, EU), Patents.
7.  **Assessments**:
    *   Written Exams, Oral Exams, Quizzes, Projects, Peer Reviews.
8.  **Financial Aid**:
    *   Scholarships (Merit, Need-based), Fellowships, Erasmus Grants.

### 🔗 Properties & Relations
*   **Object Properties (15)**: `belongsTo`, `enrolledIn`, `teaches`, `conductsResearch`, `produces`, `authors`, `partOf`, `registeredIn`, `participatesIn`, `receives`, `manages`, `fundedBy`, `attendsEvent`, `heldIn`, `supervisedBy`.
*   **Datatype Properties (8)**: `hasName` (string), `hasEmail` (string), `hasStudentID` (string), `hasCreditHours` (integer), `hasGrade` (float), `hasYearEstablished` (integer), `hasCapacity` (integer), `hasAmount` (float).

---

## 🌐 Interactive Web Visualizer

The visualizer is a modern client-side Single Page Application (SPA) designed to load, parse, and graphically display the OWL XML file directly in the browser.

### 🌟 Key Features:
*   **Interactive Force-Directed Network Graph**: Rendered using `vis-network.js`, featuring distinct visual styles for Classes (blue) and Individuals (emerald).
*   **Collapsible Class Taxonomy Tree**: Hierarchical tree explorer in the sidebar.
*   **Search & Filters**: Fuzzy search matching names across classes, properties, and individuals. Filter individuals by their class types.
*   **Details Inspector Panel**: Click on any node, list item, or property to see its full metadata (URIs, superclasses, asserted literal datatypes, and outbound/inbound object relationships).
*   **Property Highlight Mode**: Select an object property on the sidebar to highlight only the matching edges/connections in the graph.
*   **Layout Controls**: Zoom, pan, fit graph, pause physics, or toggle a strict hierarchical (up-down) layout.
*   **Dynamic OWL Uploader**: Upload any custom OWL ontology file via the **Load OWL** button.


