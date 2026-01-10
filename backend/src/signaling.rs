use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use crate::call_manager::CallManager;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct SignalingMessage {
    pub message_type: String,
    pub user_id: String,
    pub call_id: Option<String>,
    pub target_user_id: Option<String>,
    pub offer: Option<String>,
    pub answer: Option<String>,
    pub candidate: Option<String>,
    pub ip_address: Option<String>,
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.route("/signal/initiate", web::post().to(initiate_call))
        .route("/signal/accept", web::post().to(accept_call))
        .route("/signal/reject", web::post().to(reject_call))
        .route("/signal/end", web::post().to(end_call))
        .route("/signal/hold", web::post().to(hold_call))
        .route("/signal/resume", web::post().to(resume_call))
        .route("/signal/incoming", web::get().to(check_incoming_calls));
}

async fn initiate_call(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    msg: web::Json<SignalingMessage>,
) -> HttpResponse {
    let mut manager = call_manager.lock().await;
    
    if let Some(target_id) = &msg.target_user_id {
        let call = manager.create_call(msg.user_id.clone(), target_id.clone());
        
        HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "call_id": call.call_id,
            "message": "Call initiated"
        }))
    } else {
        HttpResponse::BadRequest().json(serde_json::json!({
            "status": "error",
            "message": "Target user ID required"
        }))
    }
}

async fn accept_call(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    msg: web::Json<SignalingMessage>,
) -> HttpResponse {
    let mut manager = call_manager.lock().await;
    
    if let Some(call_id) = &msg.call_id {
        manager.accept_call(call_id);
        
        HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "message": "Call accepted"
        }))
    } else {
        HttpResponse::BadRequest().json(serde_json::json!({
            "status": "error",
            "message": "Call ID required"
        }))
    }
}

async fn reject_call(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    msg: web::Json<SignalingMessage>,
) -> HttpResponse {
    let mut manager = call_manager.lock().await;
    
    if let Some(call_id) = &msg.call_id {
        manager.reject_call(call_id);
        
        HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "message": "Call rejected"
        }))
    } else {
        HttpResponse::BadRequest().json(serde_json::json!({
            "status": "error",
            "message": "Call ID required"
        }))
    }
}

async fn end_call(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    msg: web::Json<SignalingMessage>,
) -> HttpResponse {
    let mut manager = call_manager.lock().await;
    
    if let Some(call_id) = &msg.call_id {
        manager.end_call(call_id);
        
        HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "message": "Call ended"
        }))
    } else {
        HttpResponse::BadRequest().json(serde_json::json!({
            "status": "error",
            "message": "Call ID required"
        }))
    }
}

async fn hold_call(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    msg: web::Json<SignalingMessage>,
) -> HttpResponse {
    let mut manager = call_manager.lock().await;
    
    if let Some(call_id) = &msg.call_id {
        manager.hold_call(call_id);
        
        HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "message": "Call on hold"
        }))
    } else {
        HttpResponse::BadRequest().json(serde_json::json!({
            "status": "error",
            "message": "Call ID required"
        }))
    }
}

async fn resume_call(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    msg: web::Json<SignalingMessage>,
) -> HttpResponse {
    let mut manager = call_manager.lock().await;
    
    if let Some(call_id) = &msg.call_id {
        manager.accept_call(call_id);
        
        HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "message": "Call resumed"
        }))
    } else {
        HttpResponse::BadRequest().json(serde_json::json!({
            "status": "error",
            "message": "Call ID required"
        }))
    }
}

async fn check_incoming_calls(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let user_id = query.get("user_id").map(|s| s.as_str()).unwrap_or("");
    
    let manager = call_manager.lock().await;
    let calls = manager.get_incoming_calls(user_id);
    
    if let Some(call) = calls.first() {
        HttpResponse::Ok().json(serde_json::json!({
            "call": {
                "call_id": call.call_id,
                "caller_id": call.caller_id,
                "status": call.status
            }
        }))
    } else {
        HttpResponse::Ok().json(serde_json::json!({
            "call": null
        }))
    }
}
