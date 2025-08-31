// Configuração do Supabase
const SUPABASE_URL = 'https://drbukxyfvbpcqfzykose.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyYnVreHlmdmJwY3Fmenlrb3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjA0MjgsImV4cCI6MjA3MTYzNjQyOH0.HADXFF8pJLkXnwx5Gy-Xz3ccLPHjSFFwmOt6JafZP0I';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Gerenciamento de autenticação e interface
class AuthManager {
    constructor() {
        this.user = null;
        this.profile = null;
        this.init();
    }

    async init() {
        // Verificar sessão ativa
        await this.checkSession();
        
        // Configurar listener para mudanças de autenticação
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event, session);
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
                this.handleSignIn(session);
            } else if (event === 'SIGNED_OUT') {
                this.handleSignOut();
            }
        });

        // Verificar também tokens na URL (para confirmação de email)
        this.checkUrlTokens();
        
        // ✅ NOVO: Verificar confirmação de email entre dispositivos
        this.checkCrossDeviceEmailConfirmation();
    }

    async checkUrlTokens() {
        // Verificar tokens na URL (comum após confirmação de email)
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = urlParams.get('access_token');
        const refreshToken = urlParams.get('refresh_token');

        if (accessToken && refreshToken) {
            try {
                console.log('Tokens encontrados na URL, processando...');
                const { error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
                
                if (!error) {
                    // Limpar a URL para remover os tokens
                    window.history.replaceState({}, document.title, window.location.pathname);
                    console.log('Sessão configurada com sucesso a partir dos tokens da URL');
                    
                    // ✅ NOVO: Salvar para sincronização entre dispositivos
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        localStorage.setItem('emailConfirmed', 'true');
                        localStorage.setItem('userEmail', user.email);
                    }
                }
            } catch (error) {
                console.error('Erro ao processar tokens da URL:', error);
            }
        }
    }
    
    // ✅ NOVO: Verificar confirmação de email entre dispositivos
    async checkCrossDeviceEmailConfirmation() {
        const emailConfirmed = localStorage.getItem('emailConfirmed');
        const userEmail = localStorage.getItem('userEmail');
        
        if (emailConfirmed === 'true' && userEmail) {
            console.log('Email confirmado em outro dispositivo:', userEmail);
            
            try {
                // Tentar obter a sessão atual
                const { data: { session }, error } = await supabase.auth.getSession();
                
                if (!session) {
                    // Se não há sessão, mostrar mensagem para o usuário fazer login
                    console.log('Usuário precisa fazer login após confirmação de email');
                    this.showEmailConfirmedMessage(userEmail);
                } else {
                    // Se já está logado, limpar o flag
                    localStorage.removeItem('emailConfirmed');
                    localStorage.removeItem('userEmail');
                }
            } catch (error) {
                console.error('Erro ao verificar sessão cross-device:', error);
            }
        }
    }
    
    // ✅ NOVO: Mostrar mensagem de email confirmado
    showEmailConfirmedMessage(email) {
        // Criar elemento de mensagem
        const messageDiv = document.createElement('div');
        messageDiv.className = 'cross-device-message';
        messageDiv.innerHTML = `
            <i class="fas fa-check-circle"></i>
            Email ${email} confirmado com sucesso! Faça login para continuar.
        `;
        
        // Adicionar estilos se não existirem
        if (!document.querySelector('#crossDeviceStyles')) {
            const styles = document.createElement('style');
            styles.id = 'crossDeviceStyles';
            styles.textContent = `
                .cross-device-message {
                    background: #e3f2fd;
                    border: 1px solid #bbdefb;
                    border-radius: 8px;
                    padding: 15px;
                    margin: 20px 0;
                    text-align: center;
                    color: #0d47a1;
                }
                
                .cross-device-message i {
                    color: #2196f3;
                    margin-right: 10px;
                }
            `;
            document.head.appendChild(styles);
        }
        
        // Adicionar a mensagem no topo da página
        const authCard = document.querySelector('.auth-card');
        if (authCard) {
            authCard.insertBefore(messageDiv, authCard.firstChild);
        }
    }

    async checkSession() {
        try {
            console.log('Verificando sessão...');
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) {
                console.error('Erro ao obter sessão:', error);
                this.handleSignOut();
                return;
            }
            
            if (session) {
                console.log('Sessão encontrada:', session.user.email);
                await this.handleSignIn(session);
            } else {
                console.log('Nenhuma sessão encontrada');
                this.handleSignOut();
            }
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
            this.handleSignOut();
        }
    }

    async handleSignIn(session) {
        try {
            this.user = session.user;
            console.log('Usuário autenticado:', this.user.email);
            
            // ✅ VERIFICAR SE É UMA CONFIRMAÇÃO DE EMAIL
            const urlParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = urlParams.get('access_token');
            
            if (accessToken) {
                // É uma confirmação de email
                await this.handleEmailConfirmation(session);
                
                // Limpar a URL
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                // Login normal
                await this.loadUserProfile();
                this.updateUI();
            }
            
            // ✅ DAR CRÉDITOS PARA NOVOS USUÁRIOS
            await this.checkAndAwardCredits();
            
            // Limpar flags de confirmação
            localStorage.removeItem('emailConfirmed');
            localStorage.removeItem('userEmail');
            
        } catch (error) {
            console.error('Erro no handleSignIn:', error);
        }
    }
    
    // ✅ NOVO: Método para dar créditos a novos usuários
    async checkAndAwardCredits() {
    try {
        // Verificar se é um novo usuário (primeiro login)
        const hasCredits = localStorage.getItem('userCredits');
        const creditsAwarded = localStorage.getItem('creditsAwarded');
        
        if (!hasCredits && !creditsAwarded && this.user) {
            // Novo usuário - dar 100 créditos iniciais
            localStorage.setItem('userCredits', '100');
            localStorage.setItem('creditsAwarded', 'true');
            
            console.log('100 LuckCoins concedidos ao novo usuário:', this.user.email);
            
            // Mostrar notificação de boas-vindas
            if (typeof showNotification === 'function') {
                showNotification('🎉 Parabéns! Você ganhou 100 LuckCoins de boas-vindas!');
            }
            
            // Mostrar seção de boas-vindas
            this.showWelcomeSection();
        }
    } catch (error) {
        console.error('Erro ao conceder créditos:', error);
    }
}
    
    // ✅ NOVO: Mostrar seção de boas-vindas
    showWelcomeSection() {
    const welcomeSection = document.getElementById('welcome-credits');
    if (welcomeSection) {
        welcomeSection.style.display = 'block';
        
        // Rolar suavemente para a seção após um breve delay
        setTimeout(() => {
            welcomeSection.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
    }
}
    
    // ✅ NOVO: Método para lidar com confirmação de email
    async handleEmailConfirmation(session) {
        try {
            this.user = session.user;
            console.log('Usuário confirmado via email:', this.user.email);
            
            // ✅ SINCRONIZAR ENTRE DISPOSITIVOS
            localStorage.setItem('emailConfirmed', 'true');
            localStorage.setItem('userEmail', this.user.email);
            
            // Buscar perfil do usuário
            await this.loadUserProfile();
            
            this.updateUI();
            
            // ✅ DAR CRÉDITOS PARA NOVOS USUÁRIOS APÓS CONFIRMAÇÃO DE EMAIL
            await this.checkAndAwardCredits();
            
            // Forçar atualização em todas as abas abertas
            if (typeof BroadcastChannel !== 'undefined') {
                try {
                    const channel = new BroadcastChannel('auth_channel');
                    channel.postMessage({ 
                        type: 'USER_CONFIRMED', 
                        email: this.user.email 
                    });
                } catch (e) {
                    console.log('BroadcastChannel não suportado');
                }
            }
            
        } catch (error) {
            console.error('Erro no handleEmailConfirmation:', error);
        }
    }

    async loadUserProfile() {
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', this.user.id)
                .single();
                
            if (error) {
                console.error('Erro ao carregar perfil:', error);
                
                // Tentar criar perfil se não existir
                await this.createUserProfile();
                return;
            }
            
            this.profile = profile;
            console.log('Perfil carregado:', profile);
            
        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
        }
    }

    async createUserProfile() {
        try {
            // Usar metadata do usuário ou valores padrão
            const userMetadata = this.user.user_metadata || {};
            const { error } = await supabase
                .from('profiles')
                .insert([{ 
                    id: this.user.id, 
                    nome: userMetadata.nome || this.user.email.split('@')[0],
                    avatar: userMetadata.avatar || 'cachorro',
                    nivel: 1,
                    created_at: new Date().toISOString()
                }]);
            
            if (error) {
                console.error('Erro ao criar perfil:', error);
                return;
            }
            
            // Recarregar perfil após criação
            await this.loadUserProfile();
            
        } catch (error) {
            console.error('Erro ao criar perfil:', error);
        }
    }

    handleSignOut() {
        this.user = null;
        this.profile = null;
        console.log('Usuário deslogado');
        this.updateUI();
    }

    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            
            // Redirecionar para página inicial após logout
            window.location.href = '../index.html';
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }
    }

    updateUI() {
        const loginBtn = document.getElementById('loginBtn');
        const userMenu = document.getElementById('userMenu');
        
        console.log('Atualizando UI - Usuário:', this.user ? 'Logado' : 'Deslogado');
        
        if (this.user && this.profile) {
            // Usuário logado - mostrar menu de usuário
            if (loginBtn) loginBtn.style.display = 'none';
            if (userMenu) {
                userMenu.style.display = 'flex';
                
                // Atualizar avatar e nome
                this.updateUserAvatar();
                this.updateUserName();
                this.updateUserCredits();
            }
        } else {
            // Usuário não logado - mostrar botão de login
            if (loginBtn) loginBtn.style.display = 'flex';
            if (userMenu) userMenu.style.display = 'none';
        }
    }

    updateUserAvatar() {
        const avatarImg = document.querySelector('.user-avatar');
        const profileAvatar = document.querySelector('.profile-avatar');
        
        if (!this.profile) return;
        
        // Mapeamento dos avatares
        const avatarMap = {
            'cachorro': 'cachorro.jpg',
            'gato': 'gato.jpg',
            'coelho': 'coelho.jpg',
            'pássaro': 'passaro.jpg'
        };
        
        const avatarFileName = avatarMap[this.profile.avatar] || 'cachorro.jpg';
        const avatarPath = `../img/avatares/${avatarFileName}`;
        
        if (avatarImg) {
            avatarImg.src = avatarPath;
            avatarImg.alt = this.profile.nome;
            avatarImg.onerror = function() {
                console.error('Erro ao carregar avatar:', this.src);
                this.src = '../img/avatares/ava-dog1.jpg';
            }
        }
        
        if (profileAvatar) {
            profileAvatar.src = avatarPath;
            profileAvatar.alt = this.profile.nome;
            profileAvatar.onerror = function() {
                console.error('Erro ao carregar avatar do perfil:', this.src);
                this.src = '../img/avatares/cachorro.jpg';
            }
        }
    }

    updateUserName() {
        const userName = document.querySelector('.user-name');
        const profileName = document.querySelector('.profile-name');
        const profileLevel = document.querySelector('.profile-level');
        
        if (!this.profile) return;
        
        if (userName) userName.textContent = this.profile.nome;
        if (profileName) profileName.textContent = this.profile.nome;
        if (profileLevel) profileLevel.textContent = `Nível ${this.profile.nivel}`;
    }
    
    // ✅ NOVO: Atualizar créditos do usuário na UI
    updateUserCredits() {
        const userCreditsElement = document.getElementById('userCredits');
        if (userCreditsElement) {
            const userCredits = localStorage.getItem('userCredits') || '0';
            userCreditsElement.textContent = userCredits;
        }
    }

    // Método para forçar atualização da UI
    forceUpdate() {
        this.updateUI();
    }
}

// Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    console.log('Inicializando AuthManager...');
    window.authManager = new AuthManager();
    
    // Configurar toggle do dropdown
    const userToggle = document.getElementById('userToggle');
    const userDropdown = document.getElementById('userDropdown');
    
    if (userToggle && userDropdown) {
        userToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
        
        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (!userToggle.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
            }
        });
    }
    
    // Configurar logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await window.authManager.signOut();
        });
    }

    // Verificar se há mudanças de autenticação a cada 2 segundos (para garantir)
    setInterval(() => {
        if (window.authManager) {
            window.authManager.checkSession();
        }
    }, 2000);
});

// Função global para forçar atualização do auth
window.refreshAuth = function() {
    if (window.authManager) {
        window.authManager.checkSession();
    }
};

// ✅ NOVO: Função para fechar a seção de boas-vindas
window.closeWelcome = function() {
    const welcomeSection = document.getElementById('welcome-credits');
    if (welcomeSection) {
        welcomeSection.style.display = 'none';
    }
};

function updateUserCreditsUI() {
    const userCreditsElement = document.getElementById('userCredits');
    if (userCreditsElement) {
        const userCredits = localStorage.getItem('userCredits') || '0';
        userCreditsElement.textContent = userCredits;
    }
}

// ✅ Configurar logout mobile melhorado
function setupMobileLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        // Remover event listener existente para evitar duplicação
        logoutBtn.replaceWith(logoutBtn.cloneNode(true));
        
        // Novo event listener
        document.getElementById('logoutBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (window.authManager) {
                // Adicionar visual de loading
                const originalHtml = e.target.innerHTML;
                e.target.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saindo...';
                e.target.classList.add('loading');
                
                try {
                    await window.authManager.signOut();
                } catch (error) {
                    console.error('Erro no logout:', error);
                    // Forçar redirecionamento mesmo com erro
                    window.location.href = '../index.html';
                }
            }
        });
    }
}

// ✅ Inicializar quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    console.log('Inicializando AuthManager...');
    window.authManager = new AuthManager();
    
    // Configurar logout mobile
    setTimeout(setupMobileLogout, 1000);
    
    // ✅ SINCRONIZAÇÃO DE CRÉDITOS
    setInterval(() => {
        if (window.authManager && window.authManager.updateUserCredits) {
            window.authManager.updateUserCredits();
        }
    }, 2000);
    
  
});