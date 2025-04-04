import { displayDirectoryStructure, getSelectedFiles, formatRepoContents } from './utils.js';

// Global variables to store repo context
let currentRepoName = '';
let currentRefName = '';

// Load saved token on page load
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
    setupShowMoreInfoButton();
    loadSavedToken();
});

// Load saved token from local storage
function loadSavedToken() {
    const savedToken = localStorage.getItem('githubAccessToken');
    if (savedToken) {
        document.getElementById('accessToken').value = savedToken;
    }
}

// Save token to local storage
function saveToken(token) {
    if (token) {
        localStorage.setItem('githubAccessToken', token);
    } else {
        localStorage.removeItem('githubAccessToken');
    }
}

// Event listener for form submission
document.getElementById('repoForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const repoUrl = document.getElementById('repoUrl').value;
    const accessToken = document.getElementById('accessToken').value;

    // Reset global vars
    currentRepoName = '';
    currentRefName = '';

    // Save token automatically
    saveToken(accessToken);

    const outputText = document.getElementById('outputText');
    outputText.value = 'Fetching repository structure...'; // Indicate activity
    document.getElementById('directoryStructure').innerHTML = ''; // Clear previous structure
    document.getElementById('generateTextButton').style.display = 'none';
    document.getElementById('downloadZipButton').style.display = 'none';
    document.getElementById('copyButton').style.display = 'none';
    document.getElementById('downloadButton').style.display = 'none';


    try {
        // Parse repository URL and fetch repository contents
        const { owner, repo, lastString } = parseRepoUrl(repoUrl);
        let refFromUrl = '';
        let pathFromUrl = '';

        // Try to determine if lastString is a ref or part of the path
        if (lastString) {
            try {
                const references = await getReferences(owner, repo, accessToken);
                const allRefs = [...references.branches, ...references.tags];
                // Find the longest matching ref prefix
                const matchingRef = allRefs
                    .filter(ref => lastString === ref || lastString.startsWith(ref + '/'))
                    .sort((a, b) => b.length - a.length)[0]; // Prioritize longer match

                if (matchingRef) {
                    refFromUrl = matchingRef;
                    if (lastString.length > matchingRef.length) {
                        pathFromUrl = lastString.substring(matchingRef.length + 1); // Get path after ref/
                    }
                } else {
                    // Assume it's part of the path if no ref matches exactly or as prefix
                    pathFromUrl = lastString;
                }
            } catch (refError) {
                 console.warn("Could not fetch references, assuming lastString is part of the path:", refError);
                 pathFromUrl = lastString; // Fallback if fetching refs fails
            }
        }

        // Store the repo and ref names
        currentRepoName = repo;
        currentRefName = refFromUrl;
        console.log('Stored Repo Name:', currentRepoName); // Debug log
        console.log('Stored Ref Name:', currentRefName);     // Debug log

        const sha = await fetchRepoSha(owner, repo, refFromUrl, pathFromUrl, accessToken);
        const tree = await fetchRepoTree(owner, repo, sha, accessToken);

        displayDirectoryStructure(tree, pathFromUrl); // Pass pathFromUrl if needed by display logic
        document.getElementById('generateTextButton').style.display = 'flex';
        document.getElementById('downloadZipButton').style.display = 'flex';
        outputText.value = 'Repository structure loaded. Select files and click "Generate Text File" or "Download Zip".';

    } catch (error) {
        outputText.value = `Error fetching repository contents: ${error.message}\n\n` +
            "Please ensure:\n" +
            "1. The repository URL is correct and accessible.\n" +
            "2. You have the necessary permissions to access the repository.\n" +
            "3. If it's a private repository, you've provided a valid access token.\n" +
            "4. The specified branch/tag and path (if any) exist in the repository.";
        // Reset global names on error
        currentRepoName = '';
        currentRefName = '';
    }
});

// Event listener for generating text file
document.getElementById('generateTextButton').addEventListener('click', async function () {
    const accessToken = document.getElementById('accessToken').value;
    const outputText = document.getElementById('outputText');
    outputText.value = 'Generating text file...'; // Indicate activity

    // Save token automatically
    saveToken(accessToken);

    try {
        const selectedFiles = getSelectedFiles();
        if (selectedFiles.length === 0) {
            throw new Error('No files selected');
        }
        const fileContents = await fetchFileContents(selectedFiles, accessToken);
        const formattedText = formatRepoContents(fileContents);
        outputText.value = formattedText;

        document.getElementById('copyButton').style.display = 'flex';
        document.getElementById('downloadButton').style.display = 'flex';
    } catch (error) {
        outputText.value = `Error generating text file: ${error.message}\n\n` +
            "Please ensure:\n" +
            "1. You have selected at least one file from the directory structure.\n" +
            "2. Your access token (if provided) is valid and has the necessary permissions.\n" +
            "3. You have a stable internet connection.\n" +
            "4. The GitHub API is accessible and functioning normally.";
    }
});

// Event listener for downloading zip file
document.getElementById('downloadZipButton').addEventListener('click', async function () {
    const accessToken = document.getElementById('accessToken').value;
    const outputText = document.getElementById('outputText'); // Get output area for messages
    outputText.value = "Generating zip file..." // Indicate activity

    try {
        const selectedFiles = getSelectedFiles();
        if (selectedFiles.length === 0) {
            throw new Error('No files selected');
        }
        const fileContents = await fetchFileContents(selectedFiles, accessToken);
        // Pass the stored repo and ref names
        await createAndDownloadZip(fileContents, currentRepoName, currentRefName);
        outputText.value = "Zip file generated and download started."; // Success message
    } catch (error) {
        outputText.value = `Error generating zip file: ${error.message}\n\n` +
            "Please ensure:\n" +
            "1. You have selected at least one file from the directory structure.\n" +
            "2. Your access token (if provided) is valid and has the necessary permissions.\n" +
            "3. You have a stable internet connection.\n" +
            "4. The GitHub API is accessible and functioning normally.";
    }
});

// Event listener for copying text to clipboard
document.getElementById('copyButton').addEventListener('click', function () {
    const outputText = document.getElementById('outputText');
    if (!outputText.value.trim()){
        console.warn("Attempted to copy empty text.");
        return; // Don't try to copy if empty
    }
    outputText.select();
    navigator.clipboard.writeText(outputText.value)
        .then(() => console.log('Text copied to clipboard'))
        .catch(err => console.error('Failed to copy text: ', err));
});

// Event listener for downloading text file
document.getElementById('downloadButton').addEventListener('click', function () {
    const outputText = document.getElementById('outputText').value;
    if (!outputText.trim()) {
        document.getElementById('outputText').value = 'Error: No content to download. Please generate the text file first.';
        console.error("Download button clicked but no text content available.");
        return;
    }

    // --- DEBUGGING STEP ---
    console.log('Download Button - Repo Name:', currentRepoName);
    console.log('Download Button - Ref Name:', currentRefName);
    // --- END DEBUGGING STEP ---

    const now = new Date();
    const timestamp = now.getFullYear().toString() +
                      (now.getMonth() + 1).toString().padStart(2, '0') +
                      now.getDate().toString().padStart(2, '0') + '_' +
                      now.getHours().toString().padStart(2, '0') +
                      now.getMinutes().toString().padStart(2, '0') +
                      now.getSeconds().toString().padStart(2, '0');

    let filename = currentRepoName || 'output'; // Use repo name or default 'output'
    if (currentRefName) {
        // Replace slashes in ref name for filesystem compatibility
        filename += `_${currentRefName.replace(/[/\\]/g, '-')}`;
    }
    filename += `_${timestamp}.txt`;

    // --- Log the final filename ---
    console.log('Download Button - Final Filename:', filename);
    // ---

    const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' }); // Specify charset
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename; // Use the dynamic filename variable
    document.body.appendChild(a); // Append anchor to body for firefox compatibility
    a.click();
    document.body.removeChild(a); // Clean up anchor
    URL.revokeObjectURL(url);
});

// Parse GitHub repository URL
function parseRepoUrl(url) {
    // Trim trailing slash, convert backslashes
    url = url.trim().replace(/\/$/, '').replace(/\\/g, '/');

    // More robust regex to handle various URL forms including tree/blob/commit
    const urlPattern = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/(?:tree|blob|commit)\/([^\?\#]+))?.*$/;
    const match = url.match(urlPattern);

    if (!match) {
        throw new Error('Invalid GitHub repository URL format. Expected format: ' +
            'https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/path');
    }
    return {
        owner: match[1],
        repo: match[2],
        lastString: match[3] || '' // This captures everything after /tree/ or /blob/ or /commit/
    };
}

// Fetch repository references (branches and tags)
async function getReferences(owner, repo, token) {
    const headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' // Recommended practice
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`; // Use Bearer prefix
    }

    // Fetch branches and tags concurrently
    const [branchesResponse, tagsResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, { headers }), // Get up to 100 branches
        fetch(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`, { headers })       // Get up to 100 tags
    ]).catch(networkError => {
        throw new Error(`Network error fetching references: ${networkError.message}`);
    });

    // Check responses individually
    if (!branchesResponse.ok) {
        console.error("Branches response error:", branchesResponse.status, await branchesResponse.text());
        handleFetchError(branchesResponse, 'fetch branches');
    }
     if (!tagsResponse.ok) {
        console.error("Tags response error:", tagsResponse.status, await tagsResponse.text());
        handleFetchError(tagsResponse, 'fetch tags');
    }

    const branchesData = await branchesResponse.json();
    const tagsData = await tagsResponse.json();

    return {
        branches: branchesData.map(b => b.name),
        tags: tagsData.map(t => t.name)
    };
}


// Fetch repository SHA (can be commit, tree, or blob SHA)
async function fetchRepoSha(owner, repo, ref, path, token) {
    // Construct URL carefully: Handle empty path and ref
    let url = `https://api.github.com/repos/${owner}/${repo}/contents`;
    if (path) {
        url += `/${path}`;
    }
    if (ref) {
        url += `?ref=${encodeURIComponent(ref)}`; // Ensure ref is URL-encoded
    }

    const headers = {
        'Accept': 'application/vnd.github.object+json', // Get metadata including SHA
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
         // Pass specific context to error handler
        handleFetchError(response, `Workspace content SHA for path: "${path}" ref: "${ref}"`);
    }
    const data = await response.json();

    // If data is an array (directory listing), find SHA of the first element or handle appropriately
    // If data is an object (file or specific directory requested), use its SHA
    // The API usually returns the tree SHA for the root or a specific directory path
     if (data.sha) {
        return data.sha;
    } else {
        // This case might happen if the path points to something unexpected
        // or if the root content doesn't directly return a single SHA in this format
         console.warn("Could not directly determine SHA from contents response, attempting default branch commit SHA.");
         // Fallback: try fetching the default branch commit SHA
         const repoInfoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
         if (!repoInfoResponse.ok) {
             handleFetchError(repoInfoResponse, 'fetch default branch info');
         }
         const repoInfo = await repoInfoResponse.json();
         const defaultBranch = repoInfo.default_branch;
         const commitResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${ref || defaultBranch}`, { headers });
         if (!commitResponse.ok) {
            handleFetchError(commitResponse, `Workspace commit SHA for ref: "${ref || defaultBranch}"`);
         }
         const commitData = await commitResponse.json();
         return commitData.commit.tree.sha; // Return the tree SHA associated with the commit
    }
}

// Fetch repository tree (recursive)
async function fetchRepoTree(owner, repo, sha, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
    const headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
        handleFetchError(response, `Workspace tree for SHA: ${sha}`);
    }
    const data = await response.json();
    if (data.truncated) {
        console.warn("Warning: Repository tree is truncated. Some files/directories may be missing.");
        // Optionally display a warning to the user
        document.getElementById('outputText').value += "\nWarning: Repository is large, and the file list may be incomplete.";
    }
    return data.tree;
}

// Handle fetch errors consistently
async function handleFetchError(response, context = 'GitHub API request') {
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset');
    let errorMessage = `Error during ${context}. Status: ${response.status}.`;

    if (response.status === 403 && rateLimitRemaining === '0') {
        const resetTime = new Date(rateLimitReset * 1000);
        errorMessage = 'GitHub API rate limit exceeded. Please try again after ' +
                       `${resetTime.toLocaleTimeString()} or provide a valid access token.`;
    } else if (response.status === 404) {
        errorMessage = `Resource not found during ${context}. Please check that the URL, branch/tag, and path are correct and accessible.`;
    } else if (response.status === 401) {
         errorMessage = `Authentication failed during ${context}. Please provide a valid access token with 'repo' scope for private repositories.`;
    } else {
        // Try reading error message from response body
        try {
            const errorData = await response.json();
            if (errorData.message) {
                errorMessage += ` Message: ${errorData.message}`;
            }
        } catch (e) {
            // Ignore if response body is not JSON or empty
            console.warn("Could not parse error response body:", e)
        }
    }
    console.error(errorMessage, response); // Log full error details
    throw new Error(errorMessage); // Throw error to be caught by callers
}


// Fetch contents of selected files
async function fetchFileContents(files, token) {
    const headers = {
        'Accept': 'application/vnd.github.v3.raw', // Use raw content type
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    // Batch requests for efficiency (optional, simple sequential fetch here)
    const contents = await Promise.all(files.map(async file => {
        console.log(`Workspaceing content for: ${file.path} from ${file.url}`) // Debug log
        try {
            // Use the blob URL directly if available (usually from tree data)
            const response = await fetch(file.url, { headers });
            if (!response.ok) {
                 // Try to handle specific errors like 404 for a single file
                if (response.status === 404) {
                     console.warn(`File not found (404): ${file.path}. Skipping.`);
                     return { url: file.url, path: file.path, text: `// Error: File not found at path: ${file.path}`, error: true };
                }
                handleFetchError(response, `Workspace content for ${file.path}`); // Throws error for other statuses
            }
            // Check content type, handle potential non-text files gracefully
            const contentType = response.headers.get('Content-Type');
             if (contentType && !contentType.startsWith('text') && !contentType.includes('javascript') && !contentType.includes('json') && !contentType.includes('xml') && !contentType.includes('yaml')) {
                console.warn(`File ${file.path} has non-text content type: ${contentType}. Content might be binary.`);
                // You could return a placeholder or try reading anyway
                // return { url: file.url, path: file.path, text: `// Error: Non-text file skipped (${contentType})`, error: true };
            }

            const text = await response.text();
            return { url: file.url, path: file.path, text };
        } catch (error) {
             console.error(`Failed to fetch file content for ${file.path}:`, error);
             // Return an error object so Promise.all doesn't reject immediately
             return { url: file.url, path: file.path, text: `// Error fetching file: ${error.message}`, error: true };
        }
    }));

    // Filter out files that had errors if you don't want them in the output
    return contents.filter(c => !c.error);
    // Or keep them to show errors in the output text/zip
    // return contents;
}


// Show/hide token info section
function setupShowMoreInfoButton() {
    const showMoreInfoButton = document.getElementById('showMoreInfo');
    const tokenInfo = document.getElementById('tokenInfo');

    showMoreInfoButton.addEventListener('click', function() {
        tokenInfo.classList.toggle('hidden');
        updateInfoIcon(this, tokenInfo);
    });
}

// Update info icon based on visibility state
function updateInfoIcon(button, tokenInfo) {
    const icon = button.querySelector('[data-lucide]');
    if (icon) {
        icon.setAttribute('data-lucide', tokenInfo.classList.contains('hidden') ? 'info' : 'x');
        // Re-render icons using the Lucide library's method
        lucide.createIcons();
    }
}

// Create and download zip file
async function createAndDownloadZip(fileContents, repoName, refName) {
    // Ensure JSZip is loaded (might need error handling if script fails to load)
    if (typeof JSZip === 'undefined') {
         document.getElementById('outputText').value = 'Error: JSZip library not loaded. Cannot create zip file.';
         console.error("JSZip library is not available.");
         return;
    }

    const zip = new JSZip();

    fileContents.forEach(file => {
        // Handle potential errors from fetchFileContents
        if (file.error) {
             // Include error message as a file or skip
             zip.file(`ERROR_${file.path.replace(/\//g, '_')}.txt`, file.text);
             console.warn(`Including error marker for file: ${file.path}`);
        } else {
             // Remove leading slash if present for better zip structure
            const filePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
            zip.file(filePath, file.text);
        }
    });

     // --- DYNAMIC FILENAME ---
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
                      (now.getMonth() + 1).toString().padStart(2, '0') +
                      now.getDate().toString().padStart(2, '0') + '_' +
                      now.getHours().toString().padStart(2, '0') +
                      now.getMinutes().toString().padStart(2, '0') +
                      now.getSeconds().toString().padStart(2, '0');

    let filename = repoName || 'partial_repo'; // Use repo name or default 'partial_repo'
    if (refName) {
         // Replace slashes in ref name for filesystem compatibility
        filename += `_${refName.replace(/[/\\]/g, '-')}`;
    }
    filename += `_${timestamp}.zip`;
    // --- END DYNAMIC FILENAME ---

    console.log('Zip Download - Final Filename:', filename); // Debug log

    // Generate zip content
    const content = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE", // Add compression
        compressionOptions: {
            level: 6 // Compression level (1-9)
        }
     }, function updateCallback(metadata) {
         // Optional: Update UI with progress
         // console.log("Zip progress: " + metadata.percent.toFixed(2) + " %");
         document.getElementById('outputText').value = `Zipping... ${metadata.percent.toFixed(0)}%`;
     });


    // Create download link and trigger download
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename; // Use the new dynamic filename
    document.body.appendChild(a); // Append to body
    a.click();
    document.body.removeChild(a); // Clean up
    URL.revokeObjectURL(url); // Release object URL memory
}