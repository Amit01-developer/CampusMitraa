// Category Data
const categoryData = {
    "electronics": {
        name: "Electronics",
        description: "Rent high-quality electronics for your academic projects and presentations",
        stats: {
            totalItems: 24,
            avgPrice: "₹350/day",
            availability: "High"
        },
        items: [
            {
                name: "MacBook Air M1",
                price: "₹500/day",
                condition: "Excellent",
                details: "8GB RAM, 256GB SSD, includes charger",
                deposit: "₹10,000"
            },
            {
                name: "iPad Pro 11-inch",
                price: "₹350/day",
                condition: "Good",
                details: "With Apple Pencil, perfect for note-taking",
                deposit: "₹8,000"
            },
            {
                name: "Scientific Calculator",
                price: "₹50/day",
                condition: "Excellent",
                details: "Casio FX-991EX, like new condition",
                deposit: "₹2,000"
            },
            {
                name: "DSLR Camera",
                price: "₹700/day",
                condition: "Good",
                details: "Canon EOS 1500D with 18-55mm lens",
                deposit: "₹15,000"
            },
            {
                name: "Noise-Cancelling Headphones",
                price: "₹200/day",
                condition: "Excellent",
                details: "Sony WH-1000XM4, great for study sessions",
                deposit: "₹5,000"
            }
        ]
    },
    "textbooks": {
        name: "Textbooks & Study",
        description: "Save money by renting textbooks instead of buying them",
        stats: {
            totalItems: 42,
            avgPrice: "₹150/week",
            availability: "Medium"
        },
        items: [
            {
                name: "Engineering Mathematics",
                price: "₹200/week",
                condition: "Good",
                details: "4th Edition, includes solved examples",
                deposit: "₹1,500"
            },
            {
                name: "Medical Anatomy Guide",
                price: "₹300/week",
                condition: "Excellent",
                details: "Color diagrams, latest edition",
                deposit: "₹2,500"
            },
            {
                name: "Computer Science Notes",
                price: "₹100/week",
                condition: "New",
                details: "Complete DSA notes with problems",
                deposit: "₹500"
            },
            {
                name: "Business Management",
                price: "₹250/week",
                condition: "Good",
                details: "Case studies included, highlighted",
                deposit: "₹2,000"
            }
        ]
    },
    "tools": {
        name: "Tools & Equipment",
        description: "Specialized tools for lab work and creative projects",
        stats: {
            totalItems: 18,
            avgPrice: "₹250/day",
            availability: "Medium"
        },
        items: [
            {
                name: "Digital Multimeter",
                price: "₹150/day",
                condition: "Excellent",
                details: "For electronics lab, accurate readings",
                deposit: "₹3,000"
            },
            {
                name: "Art Supplies Kit",
                price: "₹300/day",
                condition: "Good",
                details: "Complete set for architecture students",
                deposit: "₹4,000"
            },
            {
                name: "Power Drill Set",
                price: "₹400/day",
                condition: "Good",
                details: "For engineering projects, includes bits",
                deposit: "₹6,000"
            },
            {
                name: "Microscope",
                price: "₹500/day",
                condition: "Excellent",
                details: "Biology lab grade, 1000x magnification",
                deposit: "₹10,000"
            }
        ]
    },
    "clothing": {
        name: "Clothing & Formal Wear",
        description: "Look professional for interviews and presentations",
        stats: {
            totalItems: 35,
            avgPrice: "₹400/event",
            availability: "High"
        },
        items: [
            {
                name: "Formal Suit Set",
                price: "₹600/event",
                condition: "Excellent",
                details: "Black, includes shirt and tie, all sizes",
                deposit: "₹5,000"
            },
            {
                name: "Blazer",
                price: "₹300/event",
                condition: "Good",
                details: "Navy blue, perfect for presentations",
                deposit: "₹3,000"
            },
            {
                name: "Traditional Ethnic Wear",
                price: "₹500/event",
                condition: "New",
                details: "For cultural events, various styles",
                deposit: "₹4,000"
            },
            {
                name: "Interview Attire Set",
                price: "₹450/event",
                condition: "Excellent",
                details: "Conservative and professional look",
                deposit: "₹3,500"
            }
        ]
    }
};

// Event Listeners for Category Cards
document.addEventListener('DOMContentLoaded', function() {
    const categoryCards = document.querySelectorAll('.category-card');
    
    categoryCards.forEach(card => {
        card.addEventListener('click', function() {
            const categoryId = this.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (categoryId) {
                showCategoryPage(categoryId);
            }
        });
    });
    
    // Add click events for all buttons
    setupButtonEvents();
    
    // Setup animations
    setupAnimations();
    
    // Setup smooth scrolling
    setupSmoothScrolling();
});

// Show Category Page
function showCategoryPage(categoryId) {
    const category = categoryData[categoryId];
    
    if (!category) return;
    
    // Hide main page, show category page
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('categoryPage').style.display = 'block';
    
    // Fill category page content
    document.getElementById('categoryTitle').textContent = category.name;
    document.getElementById('categoryDescription').textContent = category.description;
    
    // Fill statistics
    const stats = category.stats;
    const statsHTML = `
        <div class="stat-box">
            <div class="stat-value">${stats.totalItems}</div>
            <div class="stat-label">Total Items Available</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${stats.avgPrice}</div>
            <div class="stat-label">Average Rental Price</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${stats.availability}</div>
            <div class="stat-label">Availability Status</div>
        </div>
    `;
    document.getElementById('categoryStats').innerHTML = statsHTML;
    
    // Fill table with items
    const tableBody = document.getElementById('itemsTableBody');
    tableBody.innerHTML = '';
    
    category.items.forEach(item => {
        // Determine condition class
        let conditionClass = 'condition-good';
        if (item.condition.toLowerCase() === 'excellent') {
            conditionClass = 'condition-excellent';
        } else if (item.condition.toLowerCase() === 'new') {
            conditionClass = 'condition-new';
        }
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="item-name">${item.name}</td>
            <td class="item-price">${item.price}</td>
            <td>
                <span class="item-condition ${conditionClass}">${item.condition}</span>
            </td>
            <td>${item.details}</td>
            <td>${item.deposit}</td>
            <td>
                <button class="rent-button" onclick="rentItem('${item.name}', '${item.price}')">
                    <i class="fas fa-shopping-cart"></i> Rent Now
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    // Scroll to top
    window.scrollTo(0, 0);
}

// Go back to main page
function goBackToMain() {
    // Show main page, hide category page
    document.getElementById('mainPage').style.display = 'block';
    document.getElementById('categoryPage').style.display = 'none';
    
    // Scroll to top
    window.scrollTo(0, 0);
}

// Rent item function
function rentItem(itemName, itemPrice) {
    alert(`You have selected: ${itemName}\nPrice: ${item.price}\n\nYou will be redirected to checkout page.`);
    // Here you can add logic to redirect to checkout page
    // window.location.href = 'checkout.html?item=' + encodeURIComponent(itemName);
}

// Setup button events
function setupButtonEvents() {
    // Button functionality for rent/borrow buttons
    document.querySelectorAll('.btn-rent, .btn-borrow').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const itemName = this.closest('.item-card')?.querySelector('h3')?.textContent || 'Item';
            const action = this.classList.contains('btn-rent') ? 'rent' : 'borrow';
            
            alert(`You selected to ${action}: ${itemName}\n\nThis would open the booking flow in a real implementation.`);
        });
    });
    
    // Sign up button functionality
    document.querySelectorAll('.btn-primary').forEach(button => {
        if(button.textContent.includes('Join') || button.textContent.includes('Sign Up')) {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                alert('Welcome to CampusShare! This would redirect to a signup page with campus verification in a real implementation.');
            });
        }
    });
    
    // Login button functionality
    document.querySelectorAll('.btn-outline').forEach(button => {
        if(button.textContent.includes('Log In')) {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                alert('Login functionality would be implemented here.');
            });
        }
    });
}

// Setup animations
function setupAnimations() {
    const observerOptions = {
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Animate steps
    const steps = document.querySelectorAll('.step');
    steps.forEach(step => {
        step.style.opacity = '0';
        step.style.transform = 'translateY(20px)';
        step.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(step);
    });
    
    // Animate category cards
    const categoryCards = document.querySelectorAll('.category-card');
    categoryCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s';
        observer.observe(card);
    });
    
    // Animate item cards
    const itemCards = document.querySelectorAll('.item-card');
    itemCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = `opacity 0.5s ease ${0.1*index}s, transform 0.5s ease ${0.1*index}s`;
        observer.observe(card);
    });
    
    // Animate AI feature cards
    const aiCards = document.querySelectorAll('.ai-feature-card');
    aiCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = `opacity 0.6s ease ${0.2*index}s, transform 0.6s ease ${0.2*index}s`;
        observer.observe(card);
    });
}

// Setup smooth scrolling
function setupSmoothScrolling() {
    document.querySelectorAll('nav a, .btn-outline').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            
            // Only handle internal links
            if(targetId && targetId.startsWith('#')) {
                e.preventDefault();
                const targetElement = document.querySelector(targetId);
                if(targetElement) {
                    // Check if we're on category page
                    if(document.getElementById('categoryPage').style.display === 'block') {
                        // Go back to main first
                        goBackToMain();
                        
                        // Wait for main page to show then scroll
                        setTimeout(() => {
                            window.scrollTo({
                                top: targetElement.offsetTop - 80,
                                behavior: 'smooth'
                            });
                        }, 100);
                    } else {
                        window.scrollTo({
                            top: targetElement.offsetTop - 80,
                            behavior: 'smooth'
                        });
                    }
                }
            }
        });
    });
}