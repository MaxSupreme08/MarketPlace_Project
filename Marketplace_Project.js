// 1. STATE MANAGEMENT (Using localStorage so data stays when refreshing)
let listings = JSON.parse(localStorage.getItem('iips_listings')) || [];

// DOM Elements
const modal = document.getElementById('listingModal');
const openBtn = document.getElementById('openFormBtn');
const closeBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelFormBtn');
const listingForm = document.getElementById('listingForm');

const marketplaceSection = document.getElementById('marketplaceSection');
const managerSection = document.getElementById('managerSection');
const viewManagerBtn = document.getElementById('viewManagerBtn');
const viewHomeBtn = document.getElementById('viewHomeBtn');

const listingsContainer = document.getElementById('listingsContainer');
const pendingListingsContainer = document.getElementById('pendingListingsContainer');
const pendingCount = document.getElementById('pendingCount');

// 2. MODAL CONTROLS
openBtn.addEventListener('click', () => modal.showModal());
closeBtn.addEventListener('click', () => modal.close());
cancelBtn.addEventListener('click', () => modal.close());
// Close modal if user clicks on the dark backdrop outside the modal window
modal.addEventListener('click', (e) => {
  const dialogDimensions = modal.getBoundingClientRect();
  if (
    e.clientX < dialogDimensions.left ||
    e.clientX > dialogDimensions.right ||
    e.clientY < dialogDimensions.top ||
    e.clientY > dialogDimensions.bottom
  ) {
    modal.close();
  }
});

// 3. NAVIGATION TOGGLES
viewManagerBtn.addEventListener('click', () => {
  marketplaceSection.style.display = 'none';
  managerSection.style.display = 'block';
  viewManagerBtn.style.display = 'none';
  viewHomeBtn.style.display = 'inline-block';
});

viewHomeBtn.addEventListener('click', () => {
  managerSection.style.display = 'none';
  marketplaceSection.style.display = 'block';
  viewHomeBtn.style.display = 'none';
  viewManagerBtn.style.display = 'inline-block';
});

// 4. HANDLE FORM SUBMISSION
listingForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const fileInput = document.getElementById('productPhotos');
  const files = fileInput.files;

  if (files.length === 0) {
    alert('Please select at least one product image.');
    return;
  }

  // Helper function to read a single file as a Base64 string
  const readFileAsDataURL = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  };

  // Convert all selected files into an array of base64 strings
  Promise.all(Array.from(files).map(readFileAsDataURL)).then(productImagesArray => {
    const newListing = {
      id: Date.now(),
      sellerName: document.getElementById('sellerName').value,
      sellerPhoto: document.getElementById('sellerPhoto').value, // or handle via file reader too
      phone: document.getElementById('phone').value,
      whatsapp: document.getElementById('whatsapp').value,
      title: document.getElementById('title').value,
      price: document.getElementById('price').value,
      productPhotos: productImagesArray, // <-- Array of images stored here!
      usage: document.getElementById('usage').value,
      warranty: document.getElementById('warranty').value,
      description: document.getElementById('description').value,
      status: 'pending'
    };

    listings.push(newListing);
    saveAndRefresh();

    listingForm.reset();
    modal.close();
    alert('Listing submitted successfully with multiple images!');
  });
});

// 5. SAVE TO LOCALSTORAGE & RE-RENDER UI
function saveAndRefresh() {
  localStorage.setItem('iips_listings', JSON.stringify(listings));
  renderListings();
}

// 6. APPROVE OR REJECT ACTIONS (Manager)
window.updateStatus = function(id, newStatus) {
  listings = listings.map(item => {
    if (item.id === id) item.status = newStatus;
    return item;
  });
  saveAndRefresh();
};

window.deleteListing = function(id) {
  listings = listings.filter(item => item.id !== id);
  saveAndRefresh();
};

// 7. RENDER LISTINGS TO DOM
function renderListings() {
  const pendingItems = listings.filter(item => item.status === 'pending');
  const approvedItems = listings.filter(item => item.status === 'approved');

  // Update Pending Badge Count
  pendingCount.textContent = pendingItems.length;

  // Render Marketplace Feed (Approved items)
  if (approvedItems.length === 0) {
    listingsContainer.innerHTML = '<p>No listings approved yet.</p>';
  } else {
    listingsContainer.innerHTML = approvedItems.map(item => `
      <div class="card">
        <img src="${item.productPhoto}" alt="${item.title}">
        <div style="flex: 1;">
          <div class="seller-info">
            <img src="${item.sellerPhoto}" class="seller-avatar" alt="${item.sellerName}">
            <span>Posted by <strong>${item.sellerName}</strong></span>
          </div>
          <h3 style="margin: 0 0 5px 0;">${item.title}</h3>
          <p style="color: #007700; font-weight: bold; font-size: 1.1rem; margin: 0 0 8px 0;">₹${item.price}</p>
          <p style="margin: 0 0 5px 0;"><strong>Condition:</strong> ${item.usage} | <strong>Warranty:</strong> ${item.warranty}</p>
          <p style="margin: 0 0 10px 0; color: #555;">${item.description}</p>
          <div>
            <a href="tel:${item.phone}" style="background: #28a745; color: white; padding: 5px 10px; text-decoration: none; border-radius: 4px; font-size: 0.9rem; margin-right: 8px;">📞 Call Seller</a>
            <a href="https://wa.me/${item.whatsapp}?text=Hi%2C%20I%20am%20interested%20in%20your%20listing%20for%20${encodeURIComponent(item.title)}" target="_blank" style="background: #25D366; color: white; padding: 5px 10px; text-decoration: none; border-radius: 4px; font-size: 0.9rem;">💬 WhatsApp</a>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Render Manager Queue (Pending items)
  if (pendingItems.length === 0) {
    pendingListingsContainer.innerHTML = '<p>No pending approvals.</p>';
  } else {
    pendingListingsContainer.innerHTML = pendingItems.map(item => `
      <div class="card" style="border-left: 4px solid orange;">
        <img src="${item.productPhoto}" alt="${item.title}">
        <div style="flex: 1;">
          <div class="seller-info">
            <img src="${item.sellerPhoto}" class="seller-avatar" alt="${item.sellerName}">
            <span>Seller: <strong>${item.sellerName}</strong> (Ph: ${item.phone})</span>
          </div>
          <h3 style="margin: 0 0 5px 0;">${item.title} - ₹${item.price}</h3>
          <p style="margin: 0 0 5px 0;"><strong>Condition:</strong> ${item.usage} | <strong>Warranty:</strong> ${item.warranty}</p>
          <p style="margin: 0 0 10px 0; color: #555;">${item.description}</p>
          <div>
            <button onclick="updateStatus(${item.id}, 'approved')" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 8px;">✅ Approve</button>
            <button onclick="deleteListing(${item.id})" style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">❌ Reject / Delete</button>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// Initial render on page load
renderListings();
