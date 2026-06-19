// Global State Variables
let ontologyData = {
    baseURI: "http://www.example.org/academicorg#",
    classes: {},          // URI -> { uri, name, parents: [], children: [], individuals: [] }
    objectProperties: {}, // URI -> { uri, name, domains: [], ranges: [] }
    datatypeProperties: {},// URI -> { uri, name, domains: [], ranges: [] }
    individuals: {}       // URI -> { uri, name, classes: [], properties: { object: {}, datatype: {} } }
};

let network = null;
let nodesDataSet = null;
let edgesDataSet = null;
let activeTab = 'classes-tab';
let selectedElement = null; // { type: 'class'|'individual'|'property', data: {...} }
let isPhysicsActive = true;
let isHierarchicalLayout = false;

// ----------------------------------------------------------------------
// 1. XML Parsing Helpers
// ----------------------------------------------------------------------

function getElements(parent, localName, nsURI) {
    let elems = [];
    if (parent.getElementsByTagNameNS) {
        elems = Array.from(parent.getElementsByTagNameNS(nsURI, localName));
    }
    if (elems.length === 0) {
        const prefixes = ['owl:', 'rdf:', 'rdfs:', ''];
        for (let prefix of prefixes) {
            const matches = parent.getElementsByTagName(prefix + localName);
            if (matches.length > 0) {
                elems = Array.from(matches);
                break;
            }
        }
    }
    if (elems.length === 0) {
        const all = parent.getElementsByTagName('*');
        for (let i = 0; i < all.length; i++) {
            const node = all[i];
            const name = node.localName || node.tagName.split(':').pop();
            const ns = node.namespaceURI;
            if (name === localName && (!nsURI || ns === nsURI)) {
                elems.push(node);
            }
        }
    }
    return elems;
}

function getAttribute(node, attrName, nsURI) {
    let val = node.getAttribute(attrName);
    if (!val && nsURI) {
        val = node.getAttributeNS(nsURI, attrName);
    }
    if (!val) {
        // Try prefixes
        const prefixes = ['rdf:', 'owl:', 'rdfs:', ''];
        for (let prefix of prefixes) {
            val = node.getAttribute(prefix + attrName);
            if (val) break;
        }
    }
    return val;
}

function getLocalName(uri) {
    if (!uri) return "";
    if (uri.includes("#")) {
        return uri.split("#").pop();
    }
    return uri.split("/").pop();
}

function resolveURI(uri, baseURI) {
    if (!uri) return "";
    if (uri.startsWith("#")) {
        return baseURI.split('#')[0] + uri;
    }
    if (!uri.includes("://") && !uri.startsWith("http")) {
        return baseURI + uri;
    }
    return uri;
}

// ----------------------------------------------------------------------
// 2. OWL ontology parser
// ----------------------------------------------------------------------

function parseOWLOntology(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    // Namespaces
    const OWL_NS = "http://www.w3.org/2002/07/owl#";
    const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    const RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#";
    
    // Resolve base URI
    let baseURI = ontologyData.baseURI;
    const ontologyNode = getElements(xmlDoc, "Ontology", OWL_NS)[0];
    if (ontologyNode) {
        const about = getAttribute(ontologyNode, "about", RDF_NS);
        if (about) {
            baseURI = about.endsWith("#") ? about : about + "#";
        }
    }
    ontologyData.baseURI = baseURI;
    
    // Clear state
    ontologyData.classes = {};
    ontologyData.objectProperties = {};
    ontologyData.datatypeProperties = {};
    ontologyData.individuals = {};
    
    // 2.1 Parse Classes
    const classNodes = getElements(xmlDoc, "Class", OWL_NS);
    classNodes.forEach(node => {
        const about = getAttribute(node, "about", RDF_NS) || getAttribute(node, "ID", RDF_NS);
        if (!about) return;
        const uri = resolveURI(about, baseURI);
        const name = getLocalName(uri);
        
        // Find parents
        const parents = [];
        const subClassNodes = getElements(node, "subClassOf", RDFS_NS);
        subClassNodes.forEach(sc => {
            const parentResource = getAttribute(sc, "resource", RDF_NS);
            if (parentResource) {
                parents.push(resolveURI(parentResource, baseURI));
            }
        });
        
        ontologyData.classes[uri] = {
            uri,
            name,
            parents,
            children: [],
            individuals: []
        };
    });
    
    // Build Class children relationships
    Object.keys(ontologyData.classes).forEach(uri => {
        const item = ontologyData.classes[uri];
        item.parents.forEach(pUri => {
            if (ontologyData.classes[pUri]) {
                ontologyData.classes[pUri].children.push(uri);
            }
        });
    });
    
    // 2.2 Parse Object Properties
    const objPropNodes = getElements(xmlDoc, "ObjectProperty", OWL_NS);
    objPropNodes.forEach(node => {
        const about = getAttribute(node, "about", RDF_NS) || getAttribute(node, "ID", RDF_NS);
        if (!about) return;
        const uri = resolveURI(about, baseURI);
        const name = getLocalName(uri);
        
        const domains = [];
        getElements(node, "domain", RDFS_NS).forEach(d => {
            const res = getAttribute(d, "resource", RDF_NS);
            if (res) domains.push(resolveURI(res, baseURI));
        });
        
        const ranges = [];
        getElements(node, "range", RDFS_NS).forEach(r => {
            const res = getAttribute(r, "resource", RDF_NS);
            if (res) ranges.push(resolveURI(res, baseURI));
        });
        
        ontologyData.objectProperties[uri] = { uri, name, domains, ranges };
    });
    
    // 2.3 Parse Datatype Properties
    const dataPropNodes = getElements(xmlDoc, "DatatypeProperty", OWL_NS);
    dataPropNodes.forEach(node => {
        const about = getAttribute(node, "about", RDF_NS) || getAttribute(node, "ID", RDF_NS);
        if (!about) return;
        const uri = resolveURI(about, baseURI);
        const name = getLocalName(uri);
        
        const domains = [];
        getElements(node, "domain", RDFS_NS).forEach(d => {
            const res = getAttribute(d, "resource", RDF_NS);
            if (res) domains.push(resolveURI(res, baseURI));
        });
        
        const ranges = [];
        getElements(node, "range", RDFS_NS).forEach(r => {
            const res = getAttribute(r, "resource", RDF_NS);
            if (res) {
                const rangeName = getLocalName(res);
                ranges.push(rangeName.replace("XMLSchema#", ""));
            }
        });
        
        ontologyData.datatypeProperties[uri] = { uri, name, domains, ranges };
    });
    
    // Helper to process individual properties
    function processIndividualProperties(node, indUri) {
        const ind = ontologyData.individuals[indUri];
        if (!ind) return;
        
        // Loop over child nodes
        Array.from(node.childNodes).forEach(child => {
            if (child.nodeType !== 1) return; // Only element nodes
            
            const ns = child.namespaceURI;
            const pName = child.localName || child.tagName.split(':').pop();
            if (pName === 'type' && ns === RDF_NS) {
                const res = getAttribute(child, "resource", RDF_NS);
                if (res) {
                    const cUri = resolveURI(res, baseURI);
                    if (!ind.classes.includes(cUri)) {
                        ind.classes.push(cUri);
                        if (ontologyData.classes[cUri]) {
                            ontologyData.classes[cUri].individuals.push(indUri);
                        }
                    }
                }
                return;
            }
            
            const pUri = resolveURI(pName, baseURI);
            const res = getAttribute(child, "resource", RDF_NS);
            
            if (res) {
                // Object Property assertion
                const targetUri = resolveURI(res, baseURI);
                if (!ind.properties.object[pUri]) {
                    ind.properties.object[pUri] = [];
                }
                if (!ind.properties.object[pUri].includes(targetUri)) {
                    ind.properties.object[pUri].push(targetUri);
                }
            } else {
                // Datatype Property assertion (Literal value)
                const val = child.textContent.trim();
                if (val !== "") {
                    if (!ind.properties.datatype[pUri]) {
                        ind.properties.datatype[pUri] = [];
                    }
                    if (!ind.properties.datatype[pUri].includes(val)) {
                        ind.properties.datatype[pUri].push(val);
                    }
                }
            }
        });
    }
    
    // 2.4 Parse Named Individuals
    const indNodes = getElements(xmlDoc, "NamedIndividual", OWL_NS);
    indNodes.forEach(node => {
        const about = getAttribute(node, "about", RDF_NS) || getAttribute(node, "ID", RDF_NS);
        if (!about) return;
        const uri = resolveURI(about, baseURI);
        const name = getLocalName(uri);
        
        if (!ontologyData.individuals[uri]) {
            ontologyData.individuals[uri] = {
                uri,
                name,
                classes: [],
                properties: { object: {}, datatype: {} }
            };
        }
        
        processIndividualProperties(node, uri);
    });
    
    // 2.5 Parse rdf:Description (additional property assertions)
    const descNodes = getElements(xmlDoc, "Description", RDF_NS);
    descNodes.forEach(node => {
        const about = getAttribute(node, "about", RDF_NS) || getAttribute(node, "ID", RDF_NS);
        if (!about) return;
        const uri = resolveURI(about, baseURI);
        
        // If it's a known individual or we have type definitions inside it, let's parse it
        if (!ontologyData.individuals[uri]) {
            // Check if it defines a type which belongs to our ontology
            let hasOntologyType = false;
            const typeNodes = getElements(node, "type", RDF_NS);
            typeNodes.forEach(t => {
                const res = getAttribute(t, "resource", RDF_NS);
                if (res && resolveURI(res, baseURI) in ontologyData.classes) {
                    hasOntologyType = true;
                }
            });
            
            if (hasOntologyType) {
                ontologyData.individuals[uri] = {
                    uri,
                    name: getLocalName(uri),
                    classes: [],
                    properties: { object: {}, datatype: {} }
                };
            } else {
                return; // Skip description if it's not a relevant individual
            }
        }
        
        processIndividualProperties(node, uri);
    });
    
    console.log("Parsing finished.");
    updateStatsBar();
}

// ----------------------------------------------------------------------
// 3. UI Update & List Builders
// ----------------------------------------------------------------------

function updateStatsBar() {
    document.getElementById("stat-classes").textContent = Object.keys(ontologyData.classes).length;
    document.getElementById("stat-obj-props").textContent = Object.keys(ontologyData.objectProperties).length;
    document.getElementById("stat-data-props").textContent = Object.keys(ontologyData.datatypeProperties).length;
    document.getElementById("stat-individuals").textContent = Object.keys(ontologyData.individuals).length;
}

// Sidebar Tab Management
const tabs = document.querySelectorAll('.tab-btn');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        tab.classList.add('active');
        const activePane = document.getElementById(tab.getAttribute('data-tab'));
        activePane.classList.add('active');
        activeTab = tab.getAttribute('data-tab');
        applySidebarSearch();
    });
});

// Render Class Hierarchy Tree
function buildClassTreeUI() {
    const treeContainer = document.getElementById("class-tree");
    treeContainer.innerHTML = "";
    
    // Find absolute roots (classes with no parents in ontology classes)
    const roots = Object.keys(ontologyData.classes).filter(uri => {
        const item = ontologyData.classes[uri];
        return item.parents.length === 0 || (item.parents.length === 1 && item.parents[0] === resolveURI("AcademicConcept", ontologyData.baseURI));
    });
    
    // Ensure AcademicConcept is the absolute top if it exists
    const conceptUri = resolveURI("AcademicConcept", ontologyData.baseURI);
    if (ontologyData.classes[conceptUri]) {
        const nodeElem = renderTreeNode(conceptUri);
        treeContainer.appendChild(nodeElem);
    } else {
        roots.sort().forEach(rUri => {
            const nodeElem = renderTreeNode(rUri);
            treeContainer.appendChild(nodeElem);
        });
    }
}

function renderTreeNode(uri) {
    const item = ontologyData.classes[uri];
    if (!item) return document.createElement('div');
    
    const wrapper = document.createElement("div");
    wrapper.className = "tree-node-wrapper";
    wrapper.dataset.uri = uri;
    
    const content = document.createElement("div");
    content.className = "tree-node-content";
    if (selectedElement && selectedElement.type === 'class' && selectedElement.data.uri === uri) {
        content.classList.add("selected");
    }
    content.dataset.uri = uri;
    
    // Toggle Collapse icon
    const toggleIcon = document.createElement("span");
    toggleIcon.className = "tree-toggle-icon";
    if (item.children.length > 0) {
        toggleIcon.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
    }
    content.appendChild(toggleIcon);
    
    // Node Name/Label
    const label = document.createElement("span");
    label.className = "tree-node-label";
    label.textContent = item.name;
    content.appendChild(label);
    
    // Individuals count badge
    if (item.individuals.length > 0) {
        label.classList.add("has-instances");
        const instBadge = document.createElement("span");
        instBadge.className = "tree-node-inst-count";
        instBadge.textContent = item.individuals.length;
        content.appendChild(instBadge);
    }
    
    wrapper.appendChild(content);
    
    // Children Container
    if (item.children.length > 0) {
        const childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-children-container";
        item.children.sort().forEach(cUri => {
            childrenContainer.appendChild(renderTreeNode(cUri));
        });
        wrapper.appendChild(childrenContainer);
        
        // Handle collapse click
        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCollapsed = childrenContainer.style.display === 'none';
            childrenContainer.style.display = isCollapsed ? 'block' : 'none';
            toggleIcon.innerHTML = isCollapsed ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
        });
    }
    
    // Select Class click
    content.addEventListener('click', () => {
        selectClass(uri);
        focusNodeInGraph(uri);
    });
    
    return wrapper;
}

// Render Properties List
function buildPropertiesUI() {
    const objList = document.getElementById("object-properties-list");
    const dataList = document.getElementById("datatype-properties-list");
    objList.innerHTML = "";
    dataList.innerHTML = "";
    
    Object.keys(ontologyData.objectProperties).sort().forEach(uri => {
        const prop = ontologyData.objectProperties[uri];
        const li = document.createElement("li");
        li.className = "prop-item";
        li.dataset.uri = uri;
        if (selectedElement && selectedElement.type === 'property' && selectedElement.data.uri === uri) {
            li.classList.add("selected");
        }
        li.innerHTML = `<span class="prop-icon obj"><i class="fa-solid fa-link"></i></span> <span class="prop-label">${prop.name}</span>`;
        li.addEventListener('click', () => {
            selectProperty(uri, 'object');
            highlightPropertyEdges(uri);
        });
        objList.appendChild(li);
    });
    
    Object.keys(ontologyData.datatypeProperties).sort().forEach(uri => {
        const prop = ontologyData.datatypeProperties[uri];
        const li = document.createElement("li");
        li.className = "prop-item";
        li.dataset.uri = uri;
        if (selectedElement && selectedElement.type === 'property' && selectedElement.data.uri === uri) {
            li.classList.add("datatype-selected");
        }
        li.innerHTML = `<span class="prop-icon data"><i class="fa-solid fa-font"></i></span> <span class="prop-label">${prop.name}</span>`;
        li.addEventListener('click', () => {
            selectProperty(uri, 'datatype');
        });
        dataList.appendChild(li);
    });
}

// Render Individuals list with class filter
function buildIndividualsUI() {
    const filterSelect = document.getElementById("individual-class-filter");
    const currentFilter = filterSelect.value;
    
    // Rebuild filter options
    filterSelect.innerHTML = '<option value="all">All Classes</option>';
    Object.keys(ontologyData.classes).sort().forEach(uri => {
        const c = ontologyData.classes[uri];
        if (c.individuals.length > 0) {
            const opt = document.createElement("option");
            opt.value = uri;
            opt.textContent = `${c.name} (${c.individuals.length})`;
            filterSelect.appendChild(opt);
        }
    });
    filterSelect.value = currentFilter;
    
    const indList = document.getElementById("individuals-list");
    indList.innerHTML = "";
    
    const filterUri = filterSelect.value;
    Object.keys(ontologyData.individuals).sort().forEach(uri => {
        const ind = ontologyData.individuals[uri];
        if (filterUri !== 'all' && !ind.classes.includes(filterUri)) return;
        
        const li = document.createElement("li");
        li.className = "ind-item";
        li.dataset.uri = uri;
        if (selectedElement && selectedElement.type === 'individual' && selectedElement.data.uri === uri) {
            li.classList.add("selected");
        }
        li.innerHTML = `<span class="ind-icon"><i class="fa-solid fa-circle-user"></i></span> <span class="ind-label">${ind.name}</span>`;
        li.addEventListener('click', () => {
            selectIndividual(uri);
            focusNodeInGraph(uri);
        });
        indList.appendChild(li);
    });
}

document.getElementById("individual-class-filter").addEventListener("change", buildIndividualsUI);

// Sidebar Search functionality
const searchInput = document.getElementById("sidebar-search");
const clearSearchBtn = document.getElementById("clear-search");

searchInput.addEventListener("input", () => {
    const val = searchInput.value.trim();
    clearSearchBtn.style.display = val !== "" ? "block" : "none";
    applySidebarSearch();
});

clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    applySidebarSearch();
});

function applySidebarSearch() {
    const query = searchInput.value.toLowerCase().trim();
    
    if (activeTab === 'classes-tab') {
        const nodes = document.querySelectorAll('#class-tree .tree-node-content');
        nodes.forEach(n => {
            const label = n.querySelector('.tree-node-label').textContent.toLowerCase();
            const wrapper = n.closest('.tree-node-wrapper');
            
            if (query === "") {
                n.style.display = "flex";
                // Show children containers
                const childCont = wrapper.querySelector('.tree-children-container');
                if (childCont) childCont.style.display = "block";
            } else if (label.includes(query)) {
                n.style.display = "flex";
                // Highlight matches or expand parent
                let parent = wrapper.parentElement.closest('.tree-node-wrapper');
                while (parent) {
                    const parentContent = parent.querySelector('.tree-node-content');
                    parentContent.style.display = "flex";
                    const pChildCont = parent.querySelector('.tree-children-container');
                    if (pChildCont) pChildCont.style.display = "block";
                    parent = parent.parentElement.closest('.tree-node-wrapper');
                }
            } else {
                n.style.display = "none";
            }
        });
    } else if (activeTab === 'properties-tab') {
        const props = document.querySelectorAll('.prop-item');
        props.forEach(p => {
            const label = p.querySelector('.prop-label').textContent.toLowerCase();
            p.style.display = (query === "" || label.includes(query)) ? "flex" : "none";
        });
    } else if (activeTab === 'individuals-tab') {
        const inds = document.querySelectorAll('.ind-item');
        inds.forEach(ind => {
            const label = ind.querySelector('.ind-label').textContent.toLowerCase();
            ind.style.display = (query === "" || label.includes(query)) ? "flex" : "none";
        });
    }
}

// ----------------------------------------------------------------------
// 4. Selection & Inspector UI Update
// ----------------------------------------------------------------------

function selectClass(uri) {
    const cls = ontologyData.classes[uri];
    if (!cls) return;
    
    selectedElement = { type: 'class', data: cls };
    
    // Highlight list
    document.querySelectorAll('.tree-node-content').forEach(n => n.classList.remove('selected'));
    const matchedNode = document.querySelector(`.tree-node-content[data-uri="${uri}"]`);
    if (matchedNode) matchedNode.classList.add('selected');
    
    const inspectorBody = document.getElementById("inspector-body");
    
    // Build Parent links HTML
    let parentsHTML = "<li><i>None</i></li>";
    if (cls.parents.length > 0) {
        parentsHTML = cls.parents.map(p => {
            const name = getLocalName(p);
            return `<li class="detail-list-item" onclick="selectClass('${p}'); focusNodeInGraph('${p}')">
                <i class="fa-solid fa-sitemap"></i> ${name}
            </li>`;
        }).join('');
    }
    
    // Build Subclass links HTML
    let childrenHTML = "<li><i>None</i></li>";
    if (cls.children.length > 0) {
        childrenHTML = cls.children.sort().map(c => {
            const name = getLocalName(c);
            return `<li class="detail-list-item" onclick="selectClass('${c}'); focusNodeInGraph('${c}')">
                <i class="fa-solid fa-sitemap"></i> ${name}
            </li>`;
        }).join('');
    }
    
    // Build Individuals list HTML
    let individualsHTML = "<li><i>None</i></li>";
    if (cls.individuals.length > 0) {
        individualsHTML = cls.individuals.sort().map(i => {
            const name = getLocalName(i);
            return `<li class="detail-list-item ind" onclick="selectIndividual('${i}'); focusNodeInGraph('${i}')">
                <i class="fa-solid fa-circle-user"></i> ${name}
            </li>`;
        }).join('');
    }
    
    inspectorBody.innerHTML = `
        <div class="detail-card">
            <div class="detail-header">
                <span class="detail-badge badge-class">Class</span>
                <h2 class="detail-title">${cls.name}</h2>
                <div class="detail-uri">${cls.uri}</div>
            </div>
            
            <div class="detail-section">
                <h4>Superclasses</h4>
                <ul class="detail-list">${parentsHTML}</ul>
            </div>
            
            <div class="detail-section">
                <h4>Subclasses (${cls.children.length})</h4>
                <ul class="detail-list">${childrenHTML}</ul>
            </div>
            
            <div class="detail-section">
                <h4>Individuals (${cls.individuals.length})</h4>
                <ul class="detail-list">${individualsHTML}</ul>
            </div>
        </div>
    `;
    
    openInspector();
}

function selectIndividual(uri) {
    const ind = ontologyData.individuals[uri];
    if (!ind) return;
    
    selectedElement = { type: 'individual', data: ind };
    
    // Highlight sidebar
    document.querySelectorAll('.ind-item').forEach(i => i.classList.remove('selected'));
    const matchedNode = document.querySelector(`.ind-item[data-uri="${uri}"]`);
    if (matchedNode) matchedNode.classList.add('selected');
    
    const inspectorBody = document.getElementById("inspector-body");
    
    // Build Type list HTML
    let typeHTML = "";
    ind.classes.forEach(cUri => {
        const cName = getLocalName(cUri);
        typeHTML += `<span class="detail-badge badge-class clickable-link" style="display:inline-block; margin-right:4px;" onclick="selectClass('${cUri}'); focusNodeInGraph('${cUri}')">${cName}</span>`;
    });
    
    // Build Datatype properties table HTML
    let dataPropsHTML = "";
    Object.keys(ind.properties.datatype).sort().forEach(pUri => {
        const pName = getLocalName(pUri);
        const vals = ind.properties.datatype[pUri].join(", ");
        dataPropsHTML += `
            <tr>
                <td class="prop-key">${pName}</td>
                <td class="prop-value"><code>${vals}</code></td>
            </tr>
        `;
    });
    
    if (dataPropsHTML === "") {
        dataPropsHTML = `<tr><td colspan="2" style="color:var(--text-muted); font-style:italic;">No data properties asserted</td></tr>`;
    }
    
    // Build Object relations links HTML
    let objRelHTML = "";
    Object.keys(ind.properties.object).sort().forEach(pUri => {
        const pName = getLocalName(pUri);
        ind.properties.object[pUri].forEach(targetUri => {
            const targetName = getLocalName(targetUri);
            const isTargetLoaded = targetUri in ontologyData.individuals;
            const targetLink = isTargetLoaded 
                ? `<span class="clickable-link ind" onclick="selectIndividual('${targetUri}'); focusNodeInGraph('${targetUri}')">${targetName}</span>`
                : `<span style="color:var(--text-muted);">${targetName}</span>`;
                
            objRelHTML += `
                <li class="detail-list-item ind">
                    <span style="font-weight:600; color:var(--color-obj-prop);">${pName}</span>
                    <i class="fa-solid fa-arrow-right-long" style="font-size:10px; color:var(--text-muted);"></i>
                    ${targetLink}
                </li>
            `;
        });
    });
    
    if (objRelHTML === "") {
        objRelHTML = "<li><i>No relational properties asserted</i></li>";
    }
    
    inspectorBody.innerHTML = `
        <div class="detail-card">
            <div class="detail-header">
                <span class="detail-badge badge-ind">Individual</span>
                <h2 class="detail-title">${ind.name}</h2>
                <div class="detail-uri">${ind.uri}</div>
            </div>
            
            <div class="detail-section">
                <h4>Types</h4>
                <div>${typeHTML}</div>
            </div>
            
            <div class="detail-section">
                <h4>Datatypes Values</h4>
                <table class="properties-table">
                    <tbody>${dataPropsHTML}</tbody>
                </table>
            </div>
            
            <div class="detail-section">
                <h4>Object Relations</h4>
                <ul class="detail-list">${objRelHTML}</ul>
            </div>
        </div>
    `;
    
    openInspector();
}

function selectProperty(uri, propType) {
    const prop = propType === 'object' ? ontologyData.objectProperties[uri] : ontologyData.datatypeProperties[uri];
    if (!prop) return;
    
    selectedElement = { type: 'property', data: prop };
    
    // Highlight list
    document.querySelectorAll('.prop-item').forEach(i => {
        i.classList.remove('selected');
        i.classList.remove('datatype-selected');
    });
    
    const matchedNode = document.querySelector(`.prop-item[data-uri="${uri}"]`);
    if (matchedNode) {
        matchedNode.classList.add(propType === 'object' ? 'selected' : 'datatype-selected');
    }
    
    const inspectorBody = document.getElementById("inspector-body");
    
    // Build Domain classes links
    let domainHTML = "<li><i>owl:Thing</i></li>";
    if (prop.domains && prop.domains.length > 0) {
        domainHTML = prop.domains.map(d => {
            const name = getLocalName(d);
            return `<li class="detail-list-item" onclick="selectClass('${d}'); focusNodeInGraph('${d}')">
                <i class="fa-solid fa-sitemap"></i> ${name}
            </li>`;
        }).join('');
    }
    
    // Build Range classes/types links
    let rangeHTML = "<li><i>owl:Thing</i></li>";
    if (prop.ranges && prop.ranges.length > 0) {
        rangeHTML = prop.ranges.map(r => {
            const name = getLocalName(r);
            const isOntologyClass = r in ontologyData.classes;
            if (isOntologyClass) {
                return `<li class="detail-list-item" onclick="selectClass('${r}'); focusNodeInGraph('${r}')">
                    <i class="fa-solid fa-sitemap"></i> ${name}
                </li>`;
            } else {
                return `<li class="detail-list-item" style="cursor:default;">
                    <i class="fa-solid fa-font" style="color:var(--color-data-prop);"></i> ${name}
                </li>`;
            }
        }).join('');
    }
    
    inspectorBody.innerHTML = `
        <div class="detail-card">
            <div class="detail-header">
                <span class="detail-badge ${propType === 'object' ? 'badge-obj' : 'badge-data'}">${propType === 'object' ? 'Object' : 'Datatype'} Property</span>
                <h2 class="detail-title">${prop.name}</h2>
                <div class="detail-uri">${prop.uri}</div>
            </div>
            
            <div class="detail-section">
                <h4>Domain Class</h4>
                <ul class="detail-list">${domainHTML}</ul>
            </div>
            
            <div class="detail-section">
                <h4>Range Type</h4>
                <ul class="detail-list">${rangeHTML}</ul>
            </div>
        </div>
    `;
    
    openInspector();
}

function openInspector() {
    const inspector = document.getElementById("right-inspector");
    inspector.classList.remove("collapsed");
}

document.getElementById("close-inspector").addEventListener("click", () => {
    document.getElementById("right-inspector").classList.add("collapsed");
    // Clear selection classes
    document.querySelectorAll('.tree-node-content').forEach(n => n.classList.remove('selected'));
    document.querySelectorAll('.prop-item').forEach(i => {
        i.classList.remove('selected');
        i.classList.remove('datatype-selected');
    });
    document.querySelectorAll('.ind-item').forEach(i => i.classList.remove('selected'));
    selectedElement = null;
    
    // Clear graph selection
    if (network) {
        network.selectNodes([]);
        resetPropertyHighlighting();
    }
});

// ----------------------------------------------------------------------
// 5. Vis.js Graph Rendering
// ----------------------------------------------------------------------

function buildGraphNetwork() {
    const container = document.getElementById("graph-network");
    
    const nodes = [];
    const edges = [];
    
    // 5.1 Add Class Nodes
    Object.keys(ontologyData.classes).forEach(uri => {
        const cls = ontologyData.classes[uri];
        nodes.push({
            id: uri,
            label: cls.name,
            group: 'class',
            title: `<b>Class:</b> ${cls.name}<br/>${uri}`,
            color: {
                background: '#1e3a8a',
                border: '#3b82f6',
                highlight: { background: '#2563eb', border: '#60a5fa' }
            },
            font: { color: '#f3f4f6', size: 12 },
            shape: 'dot',
            size: 15,
            borderWidth: 2
        });
    });
    
    // 5.2 Add Individual Nodes
    Object.keys(ontologyData.individuals).forEach(uri => {
        const ind = ontologyData.individuals[uri];
        nodes.push({
            id: uri,
            label: ind.name,
            group: 'individual',
            title: `<b>Individual:</b> ${ind.name}<br/><b>Type:</b> ${ind.classes.map(getLocalName).join(', ')}<br/>${uri}`,
            color: {
                background: '#064e3b',
                border: '#10b981',
                highlight: { background: '#059669', border: '#34d399' }
            },
            font: { color: '#f3f4f6', size: 11 },
            shape: 'dot',
            size: 12,
            borderWidth: 1.5
        });
    });
    
    // 5.3 Add SubClass Edges (Structure)
    Object.keys(ontologyData.classes).forEach(uri => {
        const cls = ontologyData.classes[uri];
        cls.parents.forEach(parentUri => {
            if (ontologyData.classes[parentUri]) {
                edges.push({
                    from: uri,
                    to: parentUri,
                    label: 'subClassOf',
                    font: { size: 9, color: '#6b7280', align: 'top', strokeWidth: 0 },
                    arrows: { to: { enabled: true, type: 'arrow' } },
                    color: { color: 'rgba(59, 130, 246, 0.4)', highlight: '#3b82f6' },
                    dashes: true,
                    width: 1,
                    type: 'subclass'
                });
            }
        });
    });
    
    // 5.4 Add Individual Instantiation Edges
    Object.keys(ontologyData.individuals).forEach(uri => {
        const ind = ontologyData.individuals[uri];
        ind.classes.forEach(classUri => {
            if (ontologyData.classes[classUri]) {
                edges.push({
                    from: uri,
                    to: classUri,
                    label: 'type',
                    font: { size: 8, color: '#6b7280', align: 'top', strokeWidth: 0 },
                    arrows: { to: { enabled: true, type: 'arrow' } },
                    color: { color: 'rgba(16, 185, 129, 0.3)', highlight: '#10b981' },
                    width: 1,
                    type: 'type'
                });
            }
        });
    });
    
    // 5.5 Add Object Property Edges (Relational)
    Object.keys(ontologyData.individuals).forEach(uri => {
        const ind = ontologyData.individuals[uri];
        Object.keys(ind.properties.object).forEach(pUri => {
            const propName = getLocalName(pUri);
            ind.properties.object[pUri].forEach(targetUri => {
                if (targetUri in ontologyData.individuals) {
                    edges.push({
                        from: uri,
                        to: targetUri,
                        label: propName,
                        font: { size: 9, color: '#cbd5e1', align: 'middle', background: '#0f172a', strokeWidth: 0 },
                        arrows: { to: { enabled: true, type: 'arrow' } },
                        color: { color: 'rgba(148, 163, 184, 0.5)', highlight: '#ec4899' },
                        width: 1.5,
                        propertyUri: pUri,
                        type: 'objectRelation'
                    });
                }
            });
        });
    });
    
    nodesDataSet = new vis.DataSet(nodes);
    edgesDataSet = new vis.DataSet(edges);
    
    const data = { nodes: nodesDataSet, edges: edgesDataSet };
    
    const options = {
        interaction: {
            hover: true,
            tooltipDelay: 300,
            navigationButtons: false
        },
        physics: {
            enabled: isPhysicsActive,
            barnesHut: {
                gravitationalConstant: -3500,
                centralGravity: 0.35,
                springLength: 120,
                springConstant: 0.04,
                damping: 0.09,
                avoidOverlap: 0.5
            },
            stabilization: {
                enabled: true,
                iterations: 150,
                updateInterval: 25
            }
        }
    };
    
    if (network) {
        network.destroy();
    }
    
    network = new vis.Network(container, data, options);
    
    // 5.6 Interaction event listeners
    network.on("click", function(params) {
        if (params.nodes.length > 0) {
            const clickedUri = params.nodes[0];
            if (clickedUri in ontologyData.classes) {
                selectClass(clickedUri);
            } else if (clickedUri in ontologyData.individuals) {
                selectIndividual(clickedUri);
            }
            resetPropertyHighlighting();
        } else {
            // Clicked empty space
            resetPropertyHighlighting();
        }
    });
}

function focusNodeInGraph(nodeId) {
    if (!network || !nodesDataSet.get(nodeId)) return;
    
    network.selectNodes([nodeId]);
    network.focus(nodeId, {
        scale: 1.1,
        animation: {
            duration: 1000,
            easingFunction: 'easeInOutQuad'
        }
    });
}

// Highlight property links in the graph when property selected
function highlightPropertyEdges(propUri) {
    if (!edgesDataSet) return;
    
    const allEdges = edgesDataSet.get();
    const updates = [];
    
    allEdges.forEach(edge => {
        if (edge.type === 'objectRelation') {
            if (edge.propertyUri === propUri) {
                updates.push({
                    id: edge.id,
                    width: 3.5,
                    color: { color: '#ec4899', highlight: '#ec4899' },
                    font: { size: 11, color: '#ec4899', background: '#0f172a' }
                });
            } else {
                updates.push({
                    id: edge.id,
                    width: 0.5,
                    color: { color: 'rgba(148, 163, 184, 0.1)' },
                    font: { size: 8, color: 'rgba(255, 255, 255, 0.1)' }
                });
            }
        } else {
            // Dim structural edges as well
            updates.push({
                id: edge.id,
                width: 0.5,
                color: { color: 'rgba(255, 255, 255, 0.05)' },
                font: { size: 6, color: 'rgba(255, 255, 255, 0.05)' }
            });
        }
    });
    
    edgesDataSet.update(updates);
}

function resetPropertyHighlighting() {
    if (!edgesDataSet) return;
    
    const allEdges = edgesDataSet.get();
    const updates = [];
    
    allEdges.forEach(edge => {
        if (edge.type === 'objectRelation') {
            updates.push({
                id: edge.id,
                width: 1.5,
                color: { color: 'rgba(148, 163, 184, 0.5)', highlight: '#ec4899' },
                font: { size: 9, color: '#cbd5e1', background: '#0f172a' }
            });
        } else if (edge.type === 'subclass') {
            updates.push({
                id: edge.id,
                width: 1,
                color: { color: 'rgba(59, 130, 246, 0.4)', highlight: '#3b82f6' },
                font: { size: 9, color: '#6b7280' }
            });
        } else if (edge.type === 'type') {
            updates.push({
                id: edge.id,
                width: 1,
                color: { color: 'rgba(16, 185, 129, 0.3)', highlight: '#10b981' },
                font: { size: 8, color: '#6b7280' }
            });
        }
    });
    
    edgesDataSet.update(updates);
}

// Controls card action listeners
document.getElementById("zoom-in").addEventListener("click", () => {
    if (network) {
        const scale = network.getScale();
        network.moveTo({ scale: scale * 1.2 });
    }
});

document.getElementById("zoom-out").addEventListener("click", () => {
    if (network) {
        const scale = network.getScale();
        network.moveTo({ scale: scale / 1.2 });
    }
});

document.getElementById("fit-graph").addEventListener("click", () => {
    if (network) network.fit();
});

const physicsBtn = document.getElementById("toggle-physics");
physicsBtn.addEventListener("click", () => {
    if (!network) return;
    isPhysicsActive = !isPhysicsActive;
    network.setOptions({ physics: { enabled: isPhysicsActive } });
    physicsBtn.innerHTML = isPhysicsActive ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    physicsBtn.title = isPhysicsActive ? "Pause Physics" : "Resume Physics";
    physicsBtn.classList.toggle("active", !isPhysicsActive);
});

const layoutBtn = document.getElementById("toggle-layout");
layoutBtn.addEventListener("click", () => {
    if (!network) return;
    isHierarchicalLayout = !isHierarchicalLayout;
    
    let options = {};
    if (isHierarchicalLayout) {
        options = {
            layout: {
                hierarchical: {
                    direction: 'UD', // Up-Down
                    sortMethod: 'directed',
                    nodeSpacing: 180,
                    levelSeparation: 150
                }
            },
            physics: { enabled: false }
        };
        // Disable physics button state
        isPhysicsActive = false;
        physicsBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        physicsBtn.classList.add("active");
    } else {
        options = {
            layout: { hierarchical: { enabled: false } },
            physics: { enabled: true }
        };
        isPhysicsActive = true;
        physicsBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        physicsBtn.classList.remove("active");
    }
    
    network.setOptions(options);
    layoutBtn.classList.toggle("active", isHierarchicalLayout);
});

// ----------------------------------------------------------------------
// 6. Application Startup & File Loaders
// ----------------------------------------------------------------------

// Dynamic file upload
document.getElementById("owl-file-input").addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        parseOWLOntology(text);
        initializeUIViews();
    };
    reader.readAsText(file);
});

function initializeUIViews() {
    buildClassTreeUI();
    buildPropertiesUI();
    buildIndividualsUI();
    buildGraphNetwork();
}

// Load default OWL file
window.addEventListener("DOMContentLoaded", () => {
    fetch("./AcademicOrganization.owl")
        .then(response => {
            if (!response.ok) {
                throw new Error("Local OWL file not found or couldn't be loaded.");
            }
            return response.text();
        })
        .then(text => {
            parseOWLOntology(text);
            initializeUIViews();
        })
        .catch(err => {
            console.error(err);
            const classTree = document.getElementById("class-tree");
            classTree.innerHTML = `
                <div class="empty-state" style="height:auto;">
                    <i class="fa-solid fa-file-excel" style="color:var(--color-obj-prop);"></i>
                    <p>Failed to load the default ontology file.<br/>Please use the "Load OWL" button to upload your ontology.</p>
                </div>
            `;
        });
});
