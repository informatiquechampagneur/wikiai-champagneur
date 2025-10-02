import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import { ScrollArea } from './components/ui/scroll-area';
import { Separator } from './components/ui/separator';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [activeTab, setActiveTab] = useState('je_veux');
  const [isLoading, setIsLoading] = useState(false);
  const [subjects, setSubjects] = useState({});
  const messagesEndRef = useRef(null);

  const messageTypes = {
    je_veux: {
      title: 'Je veux',
      description: 'Posez vos questions ou demandez de l\'aide',
      placeholder: 'Ex: Je veux comprendre les fonctions en mathématiques...',
      icon: '🎯'
    },
    je_recherche: {
      title: 'Je recherche',
      description: 'Recherchez des informations sur un sujet',
      placeholder: 'Ex: Je recherche des informations sur la Révolution tranquille...',
      icon: '🔍'
    },
    sources_fiables: {
      title: 'Sources fiables',
      description: 'Trouvez et vérifiez des sources académiques',
      placeholder: 'Ex: Quelles sont les meilleures sources québécoises sur l\'environnement?',
      icon: '✅'
    },
    activites: {
      title: 'Activités éducatives',
      description: 'Créez des exercices et activités pédagogiques',
      placeholder: 'Ex: Créez-moi une activité sur les probabilités...',
      icon: '📚'
    }
  };

  useEffect(() => {
    fetchSubjects();
    // Génération d'un nouvel ID de session
    setSessionId(Date.now().toString());
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSubjects = async () => {
    try {
      const response = await axios.get(`${API}/subjects`);
      setSubjects(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des matières:', error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!currentMessage.trim() || isLoading) return;

    const messageToSend = currentMessage;
    setCurrentMessage('');
    setIsLoading(true);

    // Ajouter le message utilisateur
    const userMessage = {
      id: Date.now(),
      message: messageToSend,
      isUser: true,
      type: activeTab,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await axios.post(`${API}/chat`, {
        message: messageToSend,
        message_type: activeTab,
        session_id: sessionId
      });

      // Ajouter la réponse IA
      const aiMessage = {
        id: response.data.id,
        message: response.data.response,
        isUser: false,
        type: activeTab,
        trust_score: response.data.trust_score,
        sources: response.data.sources,
        timestamp: new Date(response.data.timestamp)
      };
      setMessages(prev => [...prev, aiMessage]);

      if (response.data.trust_score) {
        toast.success(`Sources analysées - Fiabilité: ${Math.round(response.data.trust_score * 100)}%`);
      }

    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'envoi du message');
      
      const errorMessage = {
        id: Date.now() + 1,
        message: 'Désolé, une erreur s\'est produite. Veuillez réessayer.',
        isUser: false,
        type: activeTab,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const getTrustBadge = (trustScore) => {
    if (!trustScore) return null;
    
    const percentage = Math.round(trustScore * 100);
    let variant = 'secondary';
    let text = '';
    
    if (percentage >= 80) {
      variant = 'default';
      text = `Très fiable (${percentage}%)`;
    } else if (percentage >= 60) {
      variant = 'secondary';
      text = `Fiable (${percentage}%)`;
    } else {
      variant = 'destructive';
      text = `Modérément fiable (${percentage}%)`;
    }
    
    return (
      <Badge variant={variant} className="text-xs">
        {text}
      </Badge>
    );
  };

  const downloadDocument = async (content, title, format) => {
    try {
      setIsLoading(true);
      
      const response = await axios.post(`${API}/generate-document`, {
        content: content,
        title: title || 'Document WikiAI',
        format: format,
        filename: `wikiai_document_${Date.now()}`
      }, {
        responseType: 'blob'
      });

      // Créer un lien de téléchargement
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const extensions = {
        'pdf': 'pdf',
        'docx': 'docx', 
        'pptx': 'pptx',
        'xlsx': 'xlsx'
      };
      
      link.setAttribute('download', `wikiai_document_${Date.now()}.${extensions[format]}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(`Document ${format.toUpperCase()} téléchargé avec succès !`);
      
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      toast.error('Erreur lors du téléchargement du document');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-orange-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">WA</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">WikiAI</h1>
                <p className="text-sm text-gray-600">Assistant IA pour les étudiants québécois fourni par le Collège Champagneur</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                ✅ Sources fiables
              </Badge>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                🍁 Québécois
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8">
            <img 
              src="https://images.unsplash.com/photo-1614492898637-435e0f87cef8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODF8MHwxfHNlYXJjaHwyfHwlQzMlQTl0dWRpYW50JTIwbHljJUMzJUE5ZXxlbnwwfHx8fDE3NTk0MTA1OTF8MA&ixlib=rb-4.1.0&q=85" 
              alt="Étudiant avec technologie" 
              className="w-32 h-32 rounded-full mx-auto object-cover shadow-lg"
            />
          </div>
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Votre assistant IA pour <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-blue-600">réussir vos études</span>
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Accédez à des sources fiables québécoises, créez des activités pédagogiques personnalisées et recevez de l'aide dans toutes vos matières avec notre IA fournie par le Collège Champagneur.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div className="grid lg:grid-cols-4 gap-6">
          
          {/* Sidebar - Matières */}
          <div className="lg:col-span-1">
            <Card className="bg-white/80 backdrop-blur-sm border-orange-100">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900">📚 Matières scolaires</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(subjects).map(([key, category]) => (
                    <div key={key} className="space-y-2">
                      <h4 className="font-semibold text-sm text-gray-700">{category.name}</h4>
                      <div className="flex flex-wrap gap-1">
                        {category.subjects?.map((subject) => (
                          <Badge key={subject} variant="outline" className="text-xs bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
                            {subject}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-3">
            <Card className="bg-white/90 backdrop-blur-sm border-orange-100 min-h-[600px] flex flex-col">
              <CardHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-4 bg-gray-50">
                    {Object.entries(messageTypes).map(([key, type]) => (
                      <TabsTrigger key={key} value={key} className="text-sm flex items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-gray-900">
                        <span className="text-xs">{type.icon}</span>
                        <span className="hidden sm:inline">{type.title}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {Object.entries(messageTypes).map(([key, type]) => (
                    <TabsContent key={key} value={key} className="mt-4">
                      <div className="text-center p-4 bg-gradient-to-r from-orange-50 to-blue-50 rounded-lg">
                        <h3 className="font-semibold text-gray-900 mb-2">{type.icon} {type.title}</h3>
                        <p className="text-sm text-gray-600">{type.description}</p>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col">
                {/* Messages */}
                <ScrollArea 
                  className="flex-1 mb-4 border-2 border-orange-200 rounded-lg" 
                  style={{ 
                    maxHeight: '400px',
                    overflow: 'auto',
                    scrollbarWidth: 'auto',
                    scrollbarColor: '#f97316 #fef3e2'
                  }}
                >
                  <div 
                    className="space-y-4 pr-2" 
                    style={{
                      height: '400px',
                      overflow: 'auto',
                      paddingRight: '8px',
                      scrollbarWidth: 'auto',
                      scrollbarColor: '#f97316 #fef3e2'
                    }}
                  >
                    {messages.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="mb-4">
                          <img 
                            src="https://images.unsplash.com/photo-1757143137415-0790a01bfa6d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODF8MHwxfHNlYXJjaHwzfHwlQzMlQTl0dWRpYW50JTIwbHljJUMzJUE5ZXxlbnwwfHx8fDE3NTk0MTA1OTF8MA&ixlib=rb-4.1.0&q=85" 
                            alt="Étudiante souriante" 
                            className="w-20 h-20 rounded-full mx-auto object-cover"
                          />
                        </div>
                        <p className="text-gray-500 mb-4">Commencez une conversation avec votre assistant IA</p>
                        <p className="text-sm text-gray-400">Choisissez un type de demande ci-dessus et posez votre question !</p>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] ${msg.isUser ? 'order-2' : 'order-1'}`}>
                            <div className={`flex items-start gap-3 ${msg.isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className={msg.isUser ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white'}>
                                  {msg.isUser ? '👤' : '🤖'}
                                </AvatarFallback>
                              </Avatar>
                              <div className={`rounded-2xl px-4 py-3 ${msg.isUser 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-100 text-gray-900'
                              }`}>
                                <p className="text-sm leading-relaxed">{msg.message}</p>
                                {msg.trust_score && (
                                  <div className="mt-2">
                                    {getTrustBadge(msg.trust_score)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className={`text-xs text-gray-400 mt-1 ${msg.isUser ? 'text-right' : 'text-left'}`}>
                              {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="flex items-start gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-orange-500 text-white">🤖</AvatarFallback>
                          </Avatar>
                          <div className="bg-gray-100 rounded-2xl px-4 py-3">
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                
                <Separator className="mb-4" />
                
                {/* Input */}
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input
                    data-testid="chat-input"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder={messageTypes[activeTab]?.placeholder || "Tapez votre message..."}
                    disabled={isLoading}
                    className="flex-1 bg-white border-gray-200 focus:border-orange-300 focus:ring-orange-200"
                  />
                  <Button 
                    data-testid="send-button"
                    type="submit" 
                    disabled={!currentMessage.trim() || isLoading}
                    className="bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 text-white font-medium px-6 transition-all duration-200"
                  >
                    {isLoading ? '...' : 'Envoyer'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Features Section */}
        <div className="mt-12">
          <h3 className="text-2xl font-bold text-center text-gray-900 mb-8">Fonctionnalités principales</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(messageTypes).map(([key, type]) => (
              <Card key={key} className="bg-white/80 backdrop-blur-sm border-orange-100 hover:shadow-lg transition-shadow cursor-pointer" 
                    onClick={() => setActiveTab(key)}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl mb-3">{type.icon}</div>
                  <h4 className="font-semibold text-gray-900 mb-2">{type.title}</h4>
                  <p className="text-sm text-gray-600">{type.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        
        {/* Educational Image */}
        <div className="mt-12 text-center">
          <img 
            src="https://images.unsplash.com/photo-1596574027151-2ce81d85af3e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzB8MHwxfHNlYXJjaHw0fHxlZHVjYXRpb24lMjBsZWFybmluZ3xlbnwwfHx8fDE3NTk0MTA1OTh8MA&ixlib=rb-4.1.0&q=85" 
            alt="Environnement d'apprentissage" 
            className="w-full max-w-2xl mx-auto rounded-xl shadow-lg object-cover h-64"
          />
          <p className="text-gray-600 mt-4 italic">Un environnement d'apprentissage moderne et collaboratif</p>
        </div>
      </div>
    </div>
  );
}

export default App;
