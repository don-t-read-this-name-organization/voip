mod call_manager;
mod signaling;
mod user;

use actix_web::{web, App, HttpServer, middleware::Logger};
use actix_cors::Cors;
use call_manager::CallManager;
use std::sync::Arc;
use tokio::sync::Mutex;
use env_logger::Env;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();
    
    let call_manager = Arc::new(Mutex::new(CallManager::new()));
    
    log::info!("Starting VoIP Server on 0.0.0.0:5000");
    
    HttpServer::new(move || {
        let call_manager = Arc::clone(&call_manager);
        
        App::new()
            .app_data(web::Data::new(call_manager))
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header()
            )
            .service(
                web::scope("/api")
                    .route("/health", web::get().to(health_check))
                    .route("/users/register", web::post().to(register_user))
                    .route("/users/list", web::get().to(list_users))
                    .route("/users/get", web::get().to(get_user))
                    .route("/users/disconnect", web::post().to(disconnect_user))
                    .service(web::scope("").configure(signaling::config))
            )
    })
    .bind("0.0.0.0:5000")?
    .run()
    .await
}

async fn health_check() -> actix_web::HttpResponse {
    actix_web::HttpResponse::Ok().json(serde_json::json!({"status": "ok"}))
}

async fn register_user(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    user_data: web::Json<serde_json::Value>,
) -> actix_web::HttpResponse {
    let user_id = uuid::Uuid::new_v4().to_string();
    let username = user_data
        .get("username")
        .and_then(|u| u.as_str())
        .unwrap_or("Unknown");
    
    let mut manager = call_manager.lock().await;
    manager.register_user(user_id.clone(), username.to_string());
    
    actix_web::HttpResponse::Ok().json(serde_json::json!({
        "user_id": user_id,
        "username": username
    }))
}

async fn list_users(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
) -> actix_web::HttpResponse {
    let manager = call_manager.lock().await;
    let users = manager.list_users();
    
    actix_web::HttpResponse::Ok().json(serde_json::json!({
        "users": users
    }))
}

async fn disconnect_user(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    user_data: web::Json<serde_json::Value>,
) -> actix_web::HttpResponse {
    let user_id = user_data
        .get("user_id")
        .and_then(|u| u.as_str())
        .unwrap_or("");
    
    let mut manager = call_manager.lock().await;
    let success = manager.disconnect_user(user_id);
    
    actix_web::HttpResponse::Ok().json(serde_json::json!({
        "success": success
    }))
}

async fn get_user(
    call_manager: web::Data<Arc<Mutex<CallManager>>>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> actix_web::HttpResponse {
    let user_id = query.get("user_id").map(|s| s.as_str()).unwrap_or("");
    
    let manager = call_manager.lock().await;
    
    if let Some(user) = manager.get_user(user_id) {
        actix_web::HttpResponse::Ok().json(serde_json::json!({
            "user_id": user.id,
            "username": user.username,
            "status": user.status
        }))
    } else {
        actix_web::HttpResponse::NotFound().json(serde_json::json!({
            "error": "User not found"
        }))
    }
}
