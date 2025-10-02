from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage
import asyncio
import re


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    message: str
    response: str
    message_type: str  # "je_veux", "je_recherche", "sources_fiables", "activites"
    trust_score: Optional[float] = None
    sources: Optional[List[str]] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    message: str
    message_type: str
    session_id: Optional[str] = None

class SearchResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    query: str
    sources: List[dict]  # [{"url": str, "title": str, "trust_score": float, "content_preview": str}]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Système de confiance des sources
TRUSTED_DOMAINS = {
    ".gouv.fr": 0.95,
    ".edu": 0.90,
    "education.gouv.fr": 0.98,
    "eduscol.education.fr": 0.95,
    "ac-": 0.85,  # sites académiques
    "rectorat": 0.85,
    "reseau-canope.fr": 0.90,
    "bnf.fr": 0.88,
    "cnrs.fr": 0.92,
    "universit": 0.75,  # sites universitaires
    "lycee": 0.70,
    ".org": 0.60,
    ".com": 0.40,
    "wikipedia": 0.65
}

def calculate_trust_score(url: str, content: str = "") -> float:
    """Calcule le score de confiance d'une source basé sur le domaine et le contenu"""
    base_score = 0.5
    
    # Vérification du domaine
    for domain, score in TRUSTED_DOMAINS.items():
        if domain in url.lower():
            base_score = max(base_score, score)
    
    # Analyse basique du contenu si fourni
    if content:
        quality_indicators = [
            "bibliographie", "références", "source", "étude", "recherche", 
            "académique", "officiel", "ministère", "université", "peer-review"
        ]
        quality_count = sum(1 for indicator in quality_indicators if indicator in content.lower())
        content_bonus = min(0.15, quality_count * 0.03)
        base_score = min(0.98, base_score + content_bonus)
    
    return round(base_score, 2)

async def get_ai_response(message: str, message_type: str) -> dict:
    """Obtient une réponse de Claude Sonnet 4 selon le type de message"""
    try:
        # Configuration du système selon le type
        system_messages = {
            "je_veux": "Tu es un assistant pédagogique français spécialisé pour les lycéens. Réponds de manière claire et éducative aux demandes d'information. Utilise un langage accessible et adapté aux lycéens français.",
            "je_recherche": "Tu es un assistant de recherche éducative. Aide les lycéens français à comprendre et explorer des sujets scolaires. Propose des pistes de recherche et des angles d'approche pédagogiques.",
            "sources_fiables": "Tu es un expert en évaluation de sources académiques françaises. Guide les lycéens vers des sources fiables (.gouv.fr, .edu, sites académiques) et explique comment évaluer la crédibilité d'une source.",
            "activites": "Tu es un créateur d'activités pédagogiques pour lycéens français. Propose des exercices, projets et activités engageantes adaptées au programme scolaire français."
        }
        
        # Initialisation du chat Claude
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"educai-{message_type}",
            system_message=system_messages.get(message_type, system_messages["je_veux"])
        ).with_model("anthropic", "claude-4-sonnet-20250514")
        
        # Envoi du message
        user_message = UserMessage(text=message)
        response = await chat.send_message(user_message)
        
        return {
            "response": response,
            "trust_score": 0.95 if message_type == "sources_fiables" else None,
            "sources": []
        }
        
    except Exception as e:
        logging.error(f"Erreur IA: {e}")
        return {
            "response": "Désolé, une erreur s'est produite. Veuillez réessayer.",
            "trust_score": None,
            "sources": []
        }

# Routes API
@api_router.get("/")
async def root():
    return {"message": "API WikiAI - Assistant IA pour étudiants québécois"}

@api_router.post("/chat", response_model=ChatMessage)
async def chat_with_ai(request: ChatRequest):
    """Endpoint principal pour le chat avec l'IA"""
    try:
        # Génération d'un session_id si non fourni
        session_id = request.session_id or str(uuid.uuid4())
        
        # Obtention de la réponse IA
        ai_result = await get_ai_response(request.message, request.message_type)
        
        # Création de l'objet ChatMessage
        chat_message = ChatMessage(
            session_id=session_id,
            message=request.message,
            response=ai_result["response"],
            message_type=request.message_type,
            trust_score=ai_result["trust_score"],
            sources=ai_result["sources"]
        )
        
        # Sauvegarde en base de données
        await db.chat_messages.insert_one(chat_message.dict())
        
        return chat_message
        
    except Exception as e:
        logging.error(f"Erreur chat: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors du traitement de la demande")

@api_router.get("/chat/history/{session_id}", response_model=List[ChatMessage])
async def get_chat_history(session_id: str):
    """Récupère l'historique d'une session de chat"""
    try:
        messages = await db.chat_messages.find(
            {"session_id": session_id}
        ).sort("timestamp", 1).to_list(100)
        
        return [ChatMessage(**message) for message in messages]
        
    except Exception as e:
        logging.error(f"Erreur historique: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la récupération de l'historique")

@api_router.post("/sources/analyze")
async def analyze_sources(sources: List[str]):
    """Analyse la fiabilité d'une liste de sources"""
    try:
        analyzed_sources = []
        
        for source_url in sources:
            trust_score = calculate_trust_score(source_url)
            analyzed_sources.append({
                "url": source_url,
                "trust_score": trust_score,
                "trust_level": "Très fiable" if trust_score >= 0.8 else 
                              "Fiable" if trust_score >= 0.6 else 
                              "Modérément fiable" if trust_score >= 0.4 else "Peu fiable",
                "recommendation": "Source recommandée" if trust_score >= 0.7 else 
                                "Vérifier avec d'autres sources" if trust_score >= 0.5 else 
                                "Source non recommandée"
            })
        
        return {"analyzed_sources": analyzed_sources}
        
    except Exception as e:
        logging.error(f"Erreur analyse sources: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'analyse des sources")

@api_router.get("/subjects")
async def get_school_subjects():
    """Retourne la liste des matières du lycée français"""
    subjects = {
        "sciences": {
            "name": "Sciences",
            "subjects": ["Mathématiques", "Physique-Chimie", "SVT", "NSI", "SI"]
        },
        "litterature": {
            "name": "Littérature & Langues",
            "subjects": ["Français", "Philosophie", "Anglais", "Espagnol", "Allemand"]
        },
        "sciences_humaines": {
            "name": "Sciences Humaines",
            "subjects": ["Histoire-Géographie", "SES", "HGGSP"]
        },
        "arts_sport": {
            "name": "Arts & Sport",
            "subjects": ["Arts Plastiques", "Musique", "EPS", "Théâtre"]
        }
    }
    return subjects

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
